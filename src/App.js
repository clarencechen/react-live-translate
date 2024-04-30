// Chakra Imports
import React, { useEffect, useRef, useState } from "react";
import {
  ChakraProvider,
  ColorModeScript,
  Box,
  Flex,
  Text,
  Button,
  Heading,
  theme,
} from "@chakra-ui/react";


function App() {
  const [outputTranscript, setOutputTranscript] = useState([]);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [interimConfidence, setInterimConfidence] = useState(0);
  const [recordingState, setRecordingState] = useState(false);
  const [micDisabled, setMicDisabled] = useState(true);
  const [targetLanguage, setTargetLanguage] = useState("");
  const [translatedTranscript, setTranslatedTranscript] = useState([]);
  const socketRef = useRef(null);
  const micRef = useRef(null);

  async function getMicrophone() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return new MediaRecorder(stream, { mimeType: "audio/webm" });
    } catch (error) {
      console.error("error accessing microphone:", error);
      throw error;
    }
  }

  async function openMicrophone(microphone, socket) {
    return new Promise((resolve) => {
      microphone.onstart = () => {
        console.log("client: microphone opened");
        document.body.classList.add("recording");
        resolve();
      };

      microphone.onstop = () => {
        console.log("client: microphone closed");
        document.body.classList.remove("recording");
      };

      microphone.ondataavailable = (event) => {
        console.log("client: microphone data received");
        if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
          socket.send(event.data);
        }
      };

      microphone.start(1000);
    });
  }

  async function toggleRecording() {
    if (!micRef.current) {
      return;
    }

    if (!recordingState) {
      micRef.current.resume();
      setRecordingState(true);
    } else {
      micRef.current.pause();
      setRecordingState(false);
    }
  };

  useEffect(async () => {
    const socket = new WebSocket("ws://localhost:3000");

    socket.addEventListener("open", async () => {
      console.log("client: connected to server");
      socketRef.current = socket;
    });

    socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (data.channel.alternatives[0].transcript !== "") {
        if (data.is_final) {
          setOutputTranscript((t) => [...t, data.channel.alternatives[0].transcript]);
          setInterimTranscript("");
          setInterimConfidence(0);
        } else {
          setInterimTranscript(data.channel.alternatives[0].transcript);
          setInterimConfidence(data.channel.alternatives[0].confidence);
        }
      }
    });

    socket.addEventListener("close", () => {
      console.log("client: disconnected from server");
    });

    try {
      micRef.current = await getMicrophone();
      await openMicrophone(micRef.current, socketRef.current);
      micRef.current.pause();
      setMicDisabled(false);
    } catch (error) {
      console.error("error opening microphone:", error);
    }

  }, []);

  return (
    <>
      <ColorModeScript />
      <ChakraProvider theme={theme}>
        <Box h="100%" overflow={"hidden"} bgColor="#252628">
          <Flex justifyContent={"space-between"} alignItems={"center"} h="5%" p="4">
            <Heading color="#fff" fontWeight="600" fontSize="24px" textAlign="center">
              Real-time Speech Transcription and Translation with Deepgram
            </Heading>
            <Button
              size="sm"
              onClick={toggleRecording}
              colorScheme={recordingState ? "red": "green"}
              isDisabled={micDisabled}
            >
              {recordingState ? "Stop " : "Start "} Recording
            </Button>
            <Select
              _focus={{ boxShadow: "none" }}
              border="none"
              fontWeight="600"
              borderRadius={"10px"}
              placeholder="Select Output Language..."
              isRequired={true}
              bg="yellow.700"
              variant="filled"
              width="25%"
              size="sm"
              onChange={(e) => {setTargetLanguage(e.target.value);}}
            >
              <option color="#000" value="bg">Bulgarian</option>
              <option color="#000" value="ca">Catalan</option>
              <option color="#000" value="cs">Czech</option>
              <option color="#000" value="da">Danish</option>
              <option color="#000" value="nl">Dutch</option>
              <option color="#000" value="en-US">English (United States)</option>
              <option color="#000" value="en-AU">English (Australia)</option>
              <option color="#000" value="en-GB">English (Great Britain)</option>
              <option color="#000" value="en-NZ">English (New Zealand)</option>
              <option color="#000" value="en-IN">English (India)</option>
              <option color="#000" value="et">Estonian</option>
              <option color="#000" value="fi">Finnish</option>
              <option color="#000" value="nl-BE">Flemish</option>
              <option color="#000" value="fr">French (France)</option>
              <option color="#000" value="fr-CA">French (Quebec)</option>
              <option color="#000" value="de">German</option>
              <option color="#000" value="de-CH">German (Switzerland)</option>
              <option color="#000" value="el">Greek</option>
              <option color="#000" value="hi">Hindi</option>
              <option color="#000" value="hu">Hungarian</option>
              <option color="#000" value="id">Indonesian</option>
              <option color="#000" value="it">Italian</option>
              <option color="#000" value="ja">Japanese</option>
              <option color="#000" value="ko">Korean</option>
              <option color="#000" value="lv">Latvian</option>
              <option color="#000" value="lt">Lithuanian</option>
              <option color="#000" value="ms">Malay</option>
              <option color="#000" value="no">Norwegian</option>
              <option color="#000" value="pl">Polish</option>
              <option color="#000" value="pt">Portuguese (Portugal)</option>
              <option color="#000" value="pt-BR">Portuguese (Brazil)</option>
              <option color="#000" value="ro">Romanian</option>
              <option color="#000" value="ru">Russian</option>
              <option color="#000" value="sk">Slovak</option>
              <option color="#000" value="es">Spanish (Spain)</option>
              <option color="#000" value="es-419">Spanish (Latin America)</option>
              <option color="#000" value="sv">Swedish</option>
              <option color="#000" value="th">Thai</option>
              <option color="#000" value="tr">Turkish</option>
              <option color="#000" value="uk">Ukrainian</option>
              <option color="#000" value="vi">Vietnamese</option>
            </Select>
            <Button
              size="sm"
              onClick={(e) => {
                setOutputTranscript([]);
                setInterimTranscript("");
                setInterimConfidence(0);
              }}
              colorScheme="teal"
            >
              Clear Transcript
            </Button>
          </Flex>

          <Box bg="#151117" h="95%" borderRadius={"10px"} p="4" mt="3">
            <Flex justifyContent={"space-between"}>
              <Box w="48%">
                <Text color="#fff" fontSize={"16px"}>
                  Transcribed Speech
                </Text>
                <Box
                  h="calc(100vh - 175px)"
                  overflow="auto"
                  css={{
                    "&::-webkit-scrollbar": {
                      width: "4px",
                    },
                    "&::-webkit-scrollbar-track": {
                      width: "6px",
                    },
                    "&::-webkit-scrollbar-thumb": {
                      borderRadius: "24px",
                    },
                  }}
                  mt="3"
                  borderRightWidth="1px"
                  borderRightColor="#252628"
                >
                  <Text color="#fff" fontSize={"12px"}>
                    {outputTranscript.join(" ")}
                  </Text>
                  {interimTranscript ? (
                    <Text color="#c6d704" fontSize={"12px"}>
                      {interimTranscript} - {interimConfidence}
                    </Text>
                  ) : null}
                </Box>
              </Box>
              <Box w="48%">
                <Text color="#fff" fontSize={"16px"}>
                  Translated Text
                </Text>
                <Box
                  h="calc(100vh - 175px)"
                  overflow="auto"
                  css={{
                    "&::-webkit-scrollbar": {
                      width: "4px",
                    },
                    "&::-webkit-scrollbar-track": {
                      width: "6px",
                    },
                    "&::-webkit-scrollbar-thumb": {
                      borderRadius: "24px",
                    },
                  }}
                  mt="3"
                  borderRightWidth="1px"
                  borderRightColor="#252628"
                >
                  <Text color="#fff" fontSize={"12px"}>
                    {translatedTranscript.join(" ")}
                  </Text>
                </Box>
              </Box>
            </Flex>
          </Box>
        </Box>
      </ChakraProvider>
    </>
  );
}

export default App;
