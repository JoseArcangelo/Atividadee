import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  Image,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Audio } from "expo-av";
import axios from "axios";

const API_BASE =
  Platform.OS === "android"
    ? "http://192.168.65.248:3001"
    : "http://192.168.65.248:3001";

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState<{ uri: string; type: string; name: string } | null>(null);
  const [reply, setReply] = useState<string>("");
  const [soundObj, setSoundObj] = useState<Audio.Sound | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permissão", "Permissão para acessar fotos é necessária.");
      }
    })();

    return () => {
      if (soundObj) soundObj.unloadAsync().catch(() => {});
    };
  }, []);

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      const uri = asset.uri;
      const name = uri.split("/").pop() || "image.jpg";
      const extMatch = /\.(\w+)$/.exec(name);
      const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
      const type = asset.mimeType || `image/${ext}`;
      setImage({ uri, name, type });
    }
  }

  async function sendText() {
    if (!prompt.trim()) return Alert.alert("Validação", "Digite algo antes de enviar.");
    setLoading(true);
    setStatusMsg("Enviando texto...");
    try {
      const resp = await axios.post(`${API_BASE}/chat`, { prompt });
      setReply(resp.data.reply || "");
    } catch (e: any) {
      Alert.alert("Erro", e?.message);
    } finally {
      setLoading(false);
    }
  }

  async function sendImageText() {
    if (!image) return Alert.alert("Validação", "Selecione uma imagem primeiro.");
    setLoading(true);
    setStatusMsg("Enviando imagem + texto...");
    try {
      const form = new FormData();
      form.append("image", { uri: image.uri, name: image.name, type: image.type } as any);
      form.append("prompt", prompt);
      const resp = await axios.post(`${API_BASE}/chat-image`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setReply(resp.data.reply || "");
    } catch (e: any) {
      Alert.alert("Erro", e?.message);
    } finally {
      setLoading(false);
    }
  }

  async function playAudioBase64(base64Str: string) {
    try {
      const uri = `data:audio/mp3;base64,${base64Str}`;
      const { sound } = await Audio.Sound.createAsync({ uri });
      setSoundObj(sound);
      await sound.playAsync();
    } catch (e) {
      console.error("Erro ao tocar áudio:", e);
    }
  }

  async function startRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Permissão", "Permissão de microfone negada.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY);
      await rec.startAsync();
      setRecording(rec);
    } catch (err) {
      console.error("Erro ao gravar:", err);
    }
  }

  async function stopRecording() {
    if (!recording) return;
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);

    if (!uri) return;
    const form = new FormData();
    form.append("audio", { uri, name: "audio.m4a", type: "audio/m4a" } as any);

    try {
      setLoading(true);
      const resp = await axios.post(`${API_BASE}/chat-audio`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setReply(resp.data.text || "");
    } catch (err: any) {
      Alert.alert("Erro", err?.message);
    } finally {
      setLoading(false);
    }
  }

  async function sendTextToAudio() {
    if (!prompt.trim()) return Alert.alert("Validação", "Digite um texto primeiro.");
    try {
      setLoading(true);
      const resp = await axios.post(`${API_BASE}/chat-tts`, { text: prompt });
      const base64 = resp.data.audioBase64;
      if (base64) await playAudioBase64(base64);
    } catch (err: any) {
      Alert.alert("Erro", err?.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Chat com Gemini 🎙️</Text>

      <TextInput
        style={styles.input}
        placeholder="Digite algo..."
        value={prompt}
        onChangeText={setPrompt}
        multiline
      />

      <View style={styles.buttonsRow}>
        <Button title="Enviar Texto" onPress={sendText} />
        <Button title="Selecionar Imagem" onPress={pickImage} />
      </View>

      <View style={styles.singleButton}>
        <Button title="Enviar Texto + Imagem" onPress={sendImageText} />
      </View>

      <View style={styles.buttonsRow}>
        <Button
          title={recording ? "Parar Gravação" : "Gravar Áudio"}
          onPress={recording ? stopRecording : startRecording}
        />
        <Button title="Texto → Áudio" onPress={sendTextToAudio} />
      </View>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
          <Text style={styles.statusMsg}>{statusMsg}</Text>
        </View>
      )}

      {image && <Image source={{ uri: image.uri }} style={styles.previewImage} />}
      <Text style={styles.replyTitle}>Resposta:</Text>
      <Text style={styles.replyText}>{reply}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 60, backgroundColor: "#f9f9f9" },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 16 },
  input: {
    width: "100%",
    minHeight: 60,
    borderWidth: 1,
    borderColor: "#aaa",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#fff",
  },
  buttonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 12,
    gap: 12,
  },
  singleButton: { width: "100%", marginTop: 12 },
  loadingContainer: { marginTop: 16, alignItems: "center", justifyContent: "center", gap: 8 },
  statusMsg: { marginTop: 8, fontSize: 12, color: "#555", textAlign: "center" },
  previewImage: {
    width: "100%",
    height: 220,
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  replyTitle: { width: "100%", fontSize: 18, fontWeight: "600", marginTop: 16, marginBottom: 6 },
  replyText: {
    width: "100%",
    fontSize: 14,
    lineHeight: 20,
    color: "#222",
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
    marginBottom: 24,
  },
});
