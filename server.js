const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
const dotenv = require("dotenv");
const { default: Anthropic } = require("@anthropic-ai/sdk");
dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const anthropic = new Anthropic({apiKey: process.env.ANTHROPIC_API_KEY});
const deepgramClient = createClient(process.env.DEEPGRAM_API_KEY);

let llm_history = [];
let keepAlive;

const setupDeepgram = (ws) => {
  const deepgram = deepgramClient.listen.live({
    language: "en",
    punctuate: true,
    smart_format: true,
    interim_results: true,
    vad_events: true,
    utterance_end_ms: 1000,
    model: "nova-2",
  });

  if (keepAlive) clearInterval(keepAlive);
  keepAlive = setInterval(() => {
    console.log("deepgram: keepalive");
    deepgram.keepAlive();
  }, 10 * 1000);

  deepgram.addListener(LiveTranscriptionEvents.Open, async () => {
    console.log("deepgram: connected");

    deepgram.addListener(LiveTranscriptionEvents.Transcript, (data) => {
      console.log("deepgram: transcript received");
      console.log("ws: transcript sent to client");
      ws.send(JSON.stringify(data));
    });

    deepgram.addListener(LiveTranscriptionEvents.Close, async () => {
      console.log("deepgram: disconnected");
      clearInterval(keepAlive);
      if (deepgram.getReadyState() === 1) {
        deepgram.finish();
      }
    });

    deepgram.addListener(LiveTranscriptionEvents.Error, async (error) => {
      console.log("deepgram: error received");
      console.error(error);
    });

    deepgram.addListener(LiveTranscriptionEvents.Warning, async (warning) => {
      console.log("deepgram: warning received");
      console.warn(warning);
    });

    deepgram.addListener(LiveTranscriptionEvents.Metadata, (data) => {
      console.log("deepgram: metadata received");
      console.log("ws: metadata sent to client");
      ws.send(JSON.stringify({ metadata: data }));
    });

    deepgram.addListener(LiveTranscriptionEvents.UtteranceEnd, (data) => {
      console.log("deepgram: utterance end received");
      ws.send(JSON.stringify(data));
    });
  });

  return deepgram;
};

wss.on("connection", (ws) => {
  console.log("ws: client connected");
  let deepgram = setupDeepgram(ws);

  ws.on("message", (message) => {
    console.log("ws: client data received");

    if (deepgram.getReadyState() === 1 /* OPEN */) {
      console.log("ws: data sent to deepgram");
      deepgram.send(message);
    } else if (deepgram.getReadyState() >= 2 /* 2 = CLOSING, 3 = CLOSED */) {
      console.log("ws: data couldn't be sent to deepgram");
      console.log("ws: retrying connection to deepgram");
      /* Attempt to reopen the Deepgram connection */
      deepgram.finish();
      deepgram.removeAllListeners();
      deepgram = setupDeepgram(ws);
    } else {
      console.log("ws: data couldn't be sent to deepgram");
    }
  });

  ws.on("close", () => {
    console.log("ws: client disconnected");
    if (deepgram.getReadyState() === 1) {
      deepgram.finish();
    }
    deepgram.removeAllListeners();
    deepgram = null;
  });
});

app.use(express.json());
app.post("/api/translate", async (req, res, next) => {
  try {
    const user_prompt = {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": `${req.body.text} --> ${req.body.language}`
        }
      ]
    }

    console.log(`anthropic: translating ${user_prompt.content[0].text}`);
    const stream = anthropic.messages.stream({
      model: "claude-3-opus-20240229",
      max_tokens: 2000,
      temperature: 0.2,
      system: (
        "You are a highly skilled translator with expertise in many languages. "
        + "Your task is to identify the language of the text I provide and accurately "
        + "translate it into the specified target language while preserving the meaning, "
        + "tone, and nuance of the original text. Please maintain proper grammar, spelling, "
        + "and punctuation in the translated version. Please only output the translated text "
        + "without any extra annotations, metadata, or preambles."
      ),
      messages: [...llm_history, user_prompt],
    });

    const message = await stream.finalMessage();
    console.log(`anthropic: translated ${user_prompt.content[0]?.text}`);
    res.send(message.content[0]?.text);

    llm_history = [...llm_history, user_prompt, {
      "role": message.role,
      "content": message.content,
    }];

    if (llm_history.length > 128) {
      llm_history = llm_history.slice(-128);
    }

  } catch (error) {
    next(error);
  }
})

app.use(express.static(path.join(__dirname, "build")));
app.use(express.static("public"));

app.use((req, res, next) => {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

server.listen(3000, () => {
  console.log("Server is listening on port 3000");
});
