"""
Worker WhisperX
---------------
Recebe parâmetros via JSON no stdin, executa transcrição/alinhamento
com WhisperX e retorna JSON estruturado no stdout.

Formato do JSON de entrada:
{
    "audio_path": "caminho/absoluto/do/audio.mp3",
    "mode": "transcribe" | "align",
    "language": "hr" | "pt" | "en" | ...,
    "device": "cpu" | "cuda",
    "compute_type": "int8" | "float16" | "float32",
    "model_size": "tiny" | "base" | "small" | "medium" | "large-v2" | "large-v3",
    "reference_text": "texto opcional para modo align",
    "batch_size": 8
}

Formato do JSON de saída:
{
    "ok": true,
    "language": "hr",
    "duration": 123.45,
    "segments": [
        {
            "start": 0.0,
            "end": 3.5,
            "text": "...",
            "words": [
                {"start": 0.0, "end": 0.5, "word": "...", "score": 0.98}
            ]
        }
    ]
}

Em caso de erro:
{
    "ok": false,
    "error": "mensagem de erro",
    "trace": "stacktrace opcional"
}
"""

import json
import sys
import traceback
from pathlib import Path

# IMPORTANTE: Redirecionamos stdout para stderr durante todo o processamento.
# Bibliotecas como faster-whisper, ctranslate2, pyannote, transformers etc.
# imprimem logs e barras de progresso no stdout, o que corromperia o JSON
# final que enviamos para o Node. Mantemos a referencia original para
# liberar apenas no momento de imprimir o resultado.
_REAL_STDOUT = sys.stdout
sys.stdout = sys.stderr


def emit_progress(stage: str, message: str = "") -> None:
    """Envia mensagem de progresso para stderr (Node lê em tempo real)."""
    payload = {"type": "progress", "stage": stage, "message": message}
    print(json.dumps(payload), file=sys.stderr, flush=True)


def emit_final(payload: dict) -> None:
    """Imprime o JSON final somente no stdout original e termina."""
    text = json.dumps(payload, ensure_ascii=True)
    _REAL_STDOUT.write(text)
    _REAL_STDOUT.flush()


def emit_error(message: str, trace: str = "") -> None:
    """Imprime erro estruturado em stdout e termina com codigo 1."""
    emit_final({"ok": False, "error": message, "trace": trace})
    sys.exit(1)


def run(params: dict) -> None:
    audio_path = params.get("audio_path")
    mode = params.get("mode", "transcribe")
    language = params.get("language", "hr")
    device = params.get("device", "cpu")
    compute_type = params.get("compute_type") or ("float16" if device == "cuda" else "int8")
    model_size = params.get("model_size", "small")
    reference_text = params.get("reference_text", "")
    batch_size = int(params.get("batch_size", 8))

    # Sanidade: CPU nao suporta float16
    cpu_valid = {"int8", "int8_float32", "float32"}
    cuda_valid = {"float16", "int8_float16", "int8", "float32"}
    if device == "cpu" and compute_type not in cpu_valid:
        compute_type = "int8"
    elif device == "cuda" and compute_type not in cuda_valid:
        compute_type = "float16"

    if not audio_path or not Path(audio_path).exists():
        emit_error("Arquivo de audio nao encontrado: " + str(audio_path))

    emit_progress("loading_libs", "Carregando bibliotecas")

    try:
        import whisperx  # noqa: WPS433
    except ImportError as exc:
        emit_error(
            "WhisperX nao esta instalado. Rode o setup do projeto.",
            str(exc),
        )

    emit_progress("loading_audio", f"Carregando áudio: {Path(audio_path).name}")
    audio = whisperx.load_audio(audio_path)
    duration = float(len(audio)) / 16000.0  # WhisperX usa 16kHz

    if mode == "transcribe":
        emit_progress("loading_model", f"Carregando modelo {model_size} em {device}")
        model = whisperx.load_model(
            model_size,
            device=device,
            compute_type=compute_type,
            language=language if language and language != "auto" else None,
        )

        emit_progress("transcribing", "Transcrevendo áudio")
        result = model.transcribe(audio, batch_size=batch_size)
        detected_language = result.get("language", language)

        emit_progress("loading_align_model", f"Carregando modelo de alinhamento ({detected_language})")
        try:
            align_model, metadata = whisperx.load_align_model(
                language_code=detected_language,
                device=device,
            )
            emit_progress("aligning", "Alinhando timestamps por palavra")
            result = whisperx.align(
                result["segments"],
                align_model,
                metadata,
                audio,
                device=device,
                return_char_alignments=False,
            )
            result["language"] = detected_language
        except Exception as exc:  # noqa: BLE001
            emit_progress("align_skipped", f"Alinhamento indisponível para '{detected_language}': {exc}")

        segments = result.get("segments", [])

    elif mode == "align":
        if not reference_text or not reference_text.strip():
            emit_error("Modo 'align' requer 'reference_text' não vazio")

        emit_progress("loading_align_model", f"Carregando modelo de alinhamento ({language})")
        try:
            align_model, metadata = whisperx.load_align_model(
                language_code=language,
                device=device,
            )
        except Exception as exc:  # noqa: BLE001
            emit_error(
                f"Não foi possível carregar modelo de alinhamento para '{language}'",
                str(exc),
            )

        # Para modo align, criamos um único "segmento" com o texto de referência
        # WhisperX vai dividir em palavras e alinhar com o áudio.
        reference_segments = [
            {
                "start": 0.0,
                "end": duration,
                "text": reference_text.strip(),
            }
        ]

        emit_progress("aligning", "Alinhando texto de referência com áudio")
        result = whisperx.align(
            reference_segments,
            align_model,
            metadata,
            audio,
            device=device,
            return_char_alignments=False,
        )
        result["language"] = language
        segments = result.get("segments", [])

    else:
        emit_error(f"Modo inválido: {mode}. Use 'transcribe' ou 'align'.")

    emit_progress("formatting", "Formatando resultado")

    output = {
        "ok": True,
        "language": result.get("language", language),
        "duration": round(duration, 3),
        "segments": [],
    }

    for seg in segments:
        seg_out = {
            "start": float(seg.get("start", 0.0) or 0.0),
            "end": float(seg.get("end", 0.0) or 0.0),
            "text": (seg.get("text") or "").strip(),
            "words": [],
        }
        for w in seg.get("words", []) or []:
            seg_out["words"].append(
                {
                    "start": float(w.get("start", seg_out["start"]) or seg_out["start"]),
                    "end": float(w.get("end", seg_out["end"]) or seg_out["end"]),
                    "word": (w.get("word") or "").strip(),
                    "score": float(w.get("score", 0.0) or 0.0),
                }
            )
        output["segments"].append(seg_out)

    emit_progress("done", "Concluído")
    emit_final(output)


def main() -> None:
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            emit_error("Nenhum parâmetro recebido via stdin")
        params = json.loads(raw)
        run(params)
    except json.JSONDecodeError as exc:
        emit_error(f"JSON de entrada inválido: {exc}")
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        emit_error(str(exc), traceback.format_exc())


if __name__ == "__main__":
    main()
