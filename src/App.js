// Chakra Imports
import React, { useEffect, useRef, useState } from "react";
import languageList from "./languages";
import {
  ChakraProvider,
  ColorModeScript,
  Box,
  Flex,
  Text,
  Button,
  Heading,
  Menu,
  MenuButton,
  MenuList,
  theme,
  MenuItemOption,
} from "@chakra-ui/react";


function App() {
  const [outputTranscript, setOutputTranscript] = useState([]);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [interimConfidence, setInterimConfidence] = useState(0);
  const [recordingState, setRecordingState] = useState(false);
  const [micDisabled, setMicDisabled] = useState(true);
  const [translatedTranscript, setTranslatedTranscript] = useState([]);
  const socketRef = useRef(null);
  const micRef = useRef(null);
  const targetLanguageRef = useRef("");
  const [targetLanguage, setTargetLanguage] = useState("");
  const [targetLanguageDisplay, setTargetLanguageDisplay] = useState("");

  const translateInput = useRef("");

  function updateTargetLanguage(item) {
    targetLanguageRef.current = item.name;
    setTargetLanguage(item.name);
    setTargetLanguageDisplay(item.display);
  }

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

  async function translate() {
    if (!translateInput.current || !targetLanguageRef.current) {
      return;
    }
    try {
      const response = await fetch("http://localhost:3000/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          language: targetLanguageRef.current,
          text: translateInput.current
        }),
      });
      if (response.status != 200) {
        console.log(response.statusText);
      } else {
        const result = await response.text();
        setTranslatedTranscript((t) => [...t, result]);
      }
    } catch (error) {
      console.log(error);
    }
  }

  useEffect(async () => {
    const socket = new WebSocket("ws://localhost:3000/api/deepgram");

    socket.addEventListener("open", async () => {
      console.log("client: connected to server");
      socketRef.current = socket;
      try {
        micRef.current = await getMicrophone();
        await openMicrophone(micRef.current, socketRef.current);
        micRef.current.pause();
        setMicDisabled(false);
      } catch (error) {
        console.error("error opening microphone:", error);
      }
    });

    socket.addEventListener("message", async (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "UtteranceEnd") {
        translate();
        translateInput.current = "";
        setOutputTranscript((t) => [...t, "\n"]);
        setInterimTranscript("");
        setInterimConfidence(0);
      } else if (data.type === "Results" && data.channel.alternatives[0].transcript !== "") {
        if (data.is_final) {
          translateInput.current = (
            `${translateInput.current} ${data.channel.alternatives[0].transcript}`
          );
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
      micRef.current.stop();
      setRecordingState(false);
      micRef.current = null;
      setMicDisabled(true);
    });

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
            <Menu
              _focus={{ boxShadow: "none" }}
              border="none"
              variant="filled"
              width="25%"
            >
              <MenuButton as={Button} size="sm" colorScheme="yellow">
                {targetLanguageDisplay ? `Translate to: ${targetLanguageDisplay}` : "Select Output Language"}
              </MenuButton>
              <MenuList>
                {languageList.map((item, index) => (
                  <MenuItemOption
                    onClick={() => {updateTargetLanguage(item);}}
                    fontWeight="600"
                    fontSize="12px"
                    p="0"
                  >
                    {item.display}
                  </MenuItemOption>
                ))}
              </MenuList>
            </Menu>
            <Button
              size="sm"
              onClick={toggleRecording}
              colorScheme={recordingState ? "red": "green"}
              isDisabled={micDisabled || !targetLanguageRef.current}
            >
              {recordingState ? "Stop " : "Start "} Recording
            </Button>
            <Button
              size="sm"
              onClick={(e) => {
                setTranslatedTranscript([]);
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
