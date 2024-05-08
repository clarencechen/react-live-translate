import asyncio
import logging
import os
import signal

import anthropic
import deepgram
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from fastapi.websockets import WebSocketState
from pydantic import BaseModel

load_dotenv()

app = FastAPI()


deepgram_client = deepgram.DeepgramClient(
    os.environ.get("DEEPGRAM_API_KEY", ""), deepgram.DeepgramClientOptions(options={"keepalive": "true"})
)


async def setup_deepgram(websocket: WebSocket):
    dg_connection = deepgram_client.listen.asynclive.v("1")

    async def on_close(self, data, **kwargs):
        logging.info("deepgram: disconnected")
        await self.finish()

    async def on_error(self, error, **kwargs):
        logging.error(f"deepgram: error received: {error}")

    async def on_warning(self, warning, **kwargs):
        logging.error(f"deepgram: error received: {warning}")

    async def on_transcript(self, result, **kwargs):
        logging.info("deepgram: transcript received")
        if websocket.application_state == WebSocketState.CONNECTED:
            logging.info("ws: transcript sent to client")
            await websocket.send_text(str(result))

    async def on_metadata(self, metadata, **kwargs):
        logging.info("deepgram: metadata received")
        if websocket.application_state == WebSocketState.CONNECTED:
            logging.info("ws: metadata sent to client")
            await websocket.send_text(str(metadata))

    async def on_utterance_end(self, utterance_end, **kwargs):
        logging.info("deepgram: utterance end received")
        if websocket.application_state == WebSocketState.CONNECTED:
            logging.info("ws: utterance end sent to client")
            await websocket.send_text(str(utterance_end))

    async def on_open(self, open, **kwargs):
        logging.info("deepgram: connected")

    dg_connection.on(deepgram.LiveTranscriptionEvents.Open, on_open)
    dg_connection.on(deepgram.LiveTranscriptionEvents.Transcript, on_transcript)
    dg_connection.on(deepgram.LiveTranscriptionEvents.Metadata, on_metadata)
    dg_connection.on(deepgram.LiveTranscriptionEvents.UtteranceEnd, on_utterance_end)
    dg_connection.on(deepgram.LiveTranscriptionEvents.Close, on_close)
    dg_connection.on(deepgram.LiveTranscriptionEvents.Error, on_error)
    dg_connection.on(deepgram.LiveTranscriptionEvents.Warning, on_warning)
    live_options = deepgram.LiveOptions(
        language="en",
        punctuate=True,
        smart_format=True,
        interim_results=True,
        vad_events=True,
        utterance_end_ms="1000",
        model="nova-2",
    )

    if await dg_connection.start(live_options) is False:
        logging.error("deepgram: could not connect to server")

    return dg_connection


class AnthropicTranslateObject:
    SYSTEM_PROMPT = (
        "You are a highly skilled translator with expertise in many languages. "
        "Your task is to identify the language of the text I provide and accurately "
        "translate it into the specified target language while preserving the meaning, "
        "tone, and nuance of the original text. Please maintain proper grammar, spelling, "
        "and punctuation in the translated version. Please only output the translated text "
        "without any extra annotations, metadata, or preambles."
    )

    def __init__(self) -> None:
        self.client = anthropic.AsyncAnthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
        self.llm_history = []

    async def translate(self, text: str, language: str) -> str:
        logging.info(f"anthropic: translating {text} to {language}")
        user_prompt = {"role": "user", "content": [{"type": "text", "text": f"{text} --> {language}"}]}
        try:
            response = await self.client.messages.create(
                model="claude-3-opus-20240229",
                max_tokens=2000,
                temperature=0.2,
                system=self.SYSTEM_PROMPT,
                messages=[*self.llm_history, user_prompt],
            )
        except anthropic.RateLimitError:
            return "(Error: Rate Limit)"
        else:
            logging.info(f"anthropic: translation finished generating {response.usage.output_tokens} tokens")

            self.llm_history.append(user_prompt)
            self.llm_history.append({"role": response.role, "content": response.content})
            if len(self.llm_history) > 128:
                self.llm_history = self.llm_history[-128:]

            return response.content[0].text


class AnthropicTranslateParams(BaseModel):
    language: str
    text: str


anthropic_translate_object = AnthropicTranslateObject()


@app.websocket("/api/deepgram")
async def deepgram_websocket(websocket: WebSocket):
    await websocket.accept()
    dg_connection = None
    try:
        dg_connection = await setup_deepgram(websocket)
        while True:
            data = await websocket.receive_bytes()
            logging.info("ws: client data received")
            try:
                if await dg_connection.send(data) is False:
                    raise ConnectionError
                logging.info("ws: data sent to deepgram")
            except ConnectionError:
                logging.info("ws: data couldn't be sent to deepgram")
                logging.info("ws: retrying connection to deepgram")
                await dg_connection.finish()
                dg_connection = await setup_deepgram(websocket)

    except WebSocketDisconnect:
        if dg_connection is not None:
            await dg_connection.finish()


@app.post("/api/translate")
async def translate(params: AnthropicTranslateParams):
    translation = await anthropic_translate_object.translate(params.text, params.language)
    return PlainTextResponse(translation)


app.mount("/", StaticFiles(directory="build", html=True), name="static")

if __name__ == "__main__":

    async def shutdown_handler(signal, frame):
        loop = asyncio.get_event_loop()
        logging.info(f"Received exit signal {signal}...")
        tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
        [task.cancel() for task in tasks]
        logging.info(f"Cancelling {len(tasks)} outstanding tasks")
        await asyncio.gather(*tasks, return_exceptions=True)
        loop.stop()
        logging.info("Shutdown complete.")

    signal.signal(signal.SIGTERM, lambda *args: asyncio.create_task(shutdown_handler(*args)))
    signal.signal(signal.SIGINT, lambda *args: asyncio.create_task(shutdown_handler(*args)))

    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3000)
