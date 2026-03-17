import { Toaster } from "@/components/ui/sonner";
import { Activity, Cpu, Mic, MicOff, Power, Wifi, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useUpdateBlynkPin } from "./hooks/useQueries";

const BLYNK_TOKEN = "fiFzCdYj4r_ec1JTCkEhFguHoVssls4o";
const BLYNK_URL = "https://blynk.cloud/external/api/update";

type DeviceKey = "led1" | "led2" | "led3" | "led4" | "led5" | "door" | "motor";

interface Device {
  key: DeviceKey;
  label: string;
  pin: string;
  icon: React.ReactNode;
  ocid: string;
}

const DEVICES: Device[] = [
  {
    key: "led1",
    label: "LED 1",
    pin: "V0",
    icon: <Zap size={20} />,
    ocid: "jarvis.led1_toggle",
  },
  {
    key: "led2",
    label: "LED 2",
    pin: "V1",
    icon: <Zap size={20} />,
    ocid: "jarvis.led2_toggle",
  },
  {
    key: "led3",
    label: "LED 3",
    pin: "V2",
    icon: <Zap size={20} />,
    ocid: "jarvis.led3_toggle",
  },
  {
    key: "led4",
    label: "LED 4",
    pin: "V3",
    icon: <Zap size={20} />,
    ocid: "jarvis.led4_toggle",
  },
  {
    key: "led5",
    label: "LED 5",
    pin: "V4",
    icon: <Zap size={20} />,
    ocid: "jarvis.led5_toggle",
  },
  {
    key: "door",
    label: "Door",
    pin: "V5",
    icon: <Cpu size={20} />,
    ocid: "jarvis.door_toggle",
  },
  {
    key: "motor",
    label: "Motor",
    pin: "V6",
    icon: <Activity size={20} />,
    ocid: "jarvis.motor_toggle",
  },
];

const LED_DEVICES = DEVICES.filter((d) =>
  ["led1", "led2", "led3", "led4", "led5"].includes(d.key),
);

type DeviceState = Record<DeviceKey, boolean>;

const INITIAL_STATE: DeviceState = {
  led1: false,
  led2: false,
  led3: false,
  led4: false,
  led5: false,
  door: false,
  motor: false,
};

interface ISpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult:
    | ((event: {
        results: { [k: number]: { [k: number]: { transcript: string } } };
      }) => void)
    | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => ISpeechRecognition;
declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionCtor;
    webkitSpeechRecognition: SpeechRecognitionCtor;
  }
}

type VoiceAction =
  | { type: "device"; device: DeviceKey; value: boolean }
  | { type: "all_leds"; value: boolean };

function parseVoiceCommand(transcript: string): VoiceAction | null {
  const lower = transcript.toLowerCase().trim();
  if (!lower.includes("hey jarvis")) return null;

  // All LEDs commands (check before individual LED commands)
  if (
    lower.includes("turn on all led") ||
    lower.includes("turn all led on") ||
    lower.includes("all lights on") ||
    lower.includes("all leds on")
  )
    return { type: "all_leds", value: true };
  if (
    lower.includes("turn off all led") ||
    lower.includes("turn all led off") ||
    lower.includes("all lights off") ||
    lower.includes("all leds off")
  )
    return { type: "all_leds", value: false };

  if (lower.includes("turn on led 1") || lower.includes("turn on led one"))
    return { type: "device", device: "led1", value: true };
  if (lower.includes("turn off led 1") || lower.includes("turn off led one"))
    return { type: "device", device: "led1", value: false };
  if (lower.includes("turn on led 2") || lower.includes("turn on led two"))
    return { type: "device", device: "led2", value: true };
  if (lower.includes("turn off led 2") || lower.includes("turn off led two"))
    return { type: "device", device: "led2", value: false };
  if (lower.includes("turn on led 3") || lower.includes("turn on led three"))
    return { type: "device", device: "led3", value: true };
  if (lower.includes("turn off led 3") || lower.includes("turn off led three"))
    return { type: "device", device: "led3", value: false };
  if (lower.includes("turn on led 4") || lower.includes("turn on led four"))
    return { type: "device", device: "led4", value: true };
  if (lower.includes("turn off led 4") || lower.includes("turn off led four"))
    return { type: "device", device: "led4", value: false };
  if (lower.includes("turn on led 5") || lower.includes("turn on led five"))
    return { type: "device", device: "led5", value: true };
  if (lower.includes("turn off led 5") || lower.includes("turn off led five"))
    return { type: "device", device: "led5", value: false };
  if (lower.includes("open door"))
    return { type: "device", device: "door", value: true };
  if (lower.includes("close door"))
    return { type: "device", device: "door", value: false };
  if (lower.includes("start motor"))
    return { type: "device", device: "motor", value: true };
  if (lower.includes("stop motor"))
    return { type: "device", device: "motor", value: false };

  return null;
}

const SpeechRecognitionAPI =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export default function App() {
  const [devices, setDevices] = useState<DeviceState>(INITIAL_STATE);
  const [isListening, setIsListening] = useState(false);
  const [lastCommand, setLastCommand] = useState<string>("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"success" | "error" | "info">(
    "info",
  );
  const [pendingDevice, setPendingDevice] = useState<DeviceKey | null>(null);
  const recognitionRef = useRef<InstanceType<SpeechRecognitionCtor> | null>(
    null,
  );
  const autoRestartRef = useRef(true);
  const { mutateAsync: updatePin } = useUpdateBlynkPin();

  const sendCommand = useCallback(
    async (device: Device, value: boolean) => {
      setPendingDevice(device.key);
      setDevices((prev) => ({ ...prev, [device.key]: value }));

      try {
        const url = `${BLYNK_URL}?token=${BLYNK_TOKEN}&${device.pin}=${value ? "1" : "0"}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Blynk API error");

        const msg = `${device.label} turned ${value ? "ON" : "OFF"}`;
        setStatusMsg(msg);
        setStatusType("success");
        toast.success(msg);
      } catch {
        try {
          await updatePin({ pin: device.pin, value: value ? "1" : "0" });
          const msg = `${device.label} turned ${value ? "ON" : "OFF"}`;
          setStatusMsg(msg);
          setStatusType("success");
          toast.success(msg);
        } catch {
          setDevices((prev) => ({ ...prev, [device.key]: !value }));
          setStatusMsg(`Failed to update ${device.label}`);
          setStatusType("error");
          toast.error(`Failed to update ${device.label}`);
        }
      } finally {
        setPendingDevice(null);
        setTimeout(() => setStatusMsg(null), 3000);
      }
    },
    [updatePin],
  );

  const sendAllLEDs = useCallback(
    async (value: boolean) => {
      const label = value ? "All LEDs ON" : "All LEDs OFF";
      setDevices((prev) => ({
        ...prev,
        led1: value,
        led2: value,
        led3: value,
        led4: value,
        led5: value,
      }));

      try {
        await Promise.all(
          LED_DEVICES.map((d) =>
            fetch(
              `${BLYNK_URL}?token=${BLYNK_TOKEN}&${d.pin}=${value ? "1" : "0"}`,
            ),
          ),
        );
        setStatusMsg(label);
        setStatusType("success");
        toast.success(label);
      } catch {
        try {
          await Promise.all(
            LED_DEVICES.map((d) =>
              updatePin({ pin: d.pin, value: value ? "1" : "0" }),
            ),
          );
          setStatusMsg(label);
          setStatusType("success");
          toast.success(label);
        } catch {
          setDevices((prev) => ({
            ...prev,
            led1: !value,
            led2: !value,
            led3: !value,
            led4: !value,
            led5: !value,
          }));
          setStatusMsg("Failed to update LEDs");
          setStatusType("error");
          toast.error("Failed to update LEDs");
        }
      } finally {
        setTimeout(() => setStatusMsg(null), 3000);
      }
    },
    [updatePin],
  );

  const handleVoiceResult = useCallback(
    (transcript: string) => {
      setLastCommand(transcript);
      const lower = transcript.toLowerCase();

      if (!lower.includes("hey jarvis")) {
        return; // ignore non-wake-word speech silently
      }

      const parsed = parseVoiceCommand(transcript);
      if (!parsed) {
        setStatusMsg("Command not recognized");
        setStatusType("error");
        toast.error("Command not recognized");
        setTimeout(() => setStatusMsg(null), 3000);
        return;
      }

      if (parsed.type === "all_leds") {
        sendAllLEDs(parsed.value);
      } else {
        const device = DEVICES.find((d) => d.key === parsed.device)!;
        sendCommand(device, parsed.value);
      }
    },
    [sendCommand, sendAllLEDs],
  );

  const startListening = useCallback(() => {
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => {
      setIsListening(false);
      // Auto-restart to keep always listening
      if (autoRestartRef.current) {
        setTimeout(() => {
          if (autoRestartRef.current) {
            try {
              recognition.start();
            } catch {
              // If start fails, create a new instance
              startListening();
            }
          }
        }, 300);
      }
    };
    recognition.onerror = () => {
      setIsListening(false);
      // Restart on error after a brief delay
      if (autoRestartRef.current) {
        setTimeout(() => {
          if (autoRestartRef.current) startListening();
        }, 1000);
      }
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      handleVoiceResult(transcript);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      // ignore if already started
    }
  }, [handleVoiceResult]);

  const stopListening = useCallback(() => {
    autoRestartRef.current = false;
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const toggleMic = useCallback(() => {
    if (isListening || autoRestartRef.current) {
      stopListening();
    } else {
      autoRestartRef.current = true;
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Auto-start listening on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only
  useEffect(() => {
    if (SpeechRecognitionAPI) {
      autoRestartRef.current = true;
      startListening();
    }
    return () => {
      autoRestartRef.current = false;
      recognitionRef.current?.stop();
    };
  }, []);

  const activeCount = Object.values(devices).filter(Boolean).length;
  const micActive = isListening || autoRestartRef.current;

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      {/* Grid background */}
      <div className="fixed inset-0 jarvis-grid-bg opacity-100 pointer-events-none" />
      <div className="fixed inset-0 jarvis-scanlines pointer-events-none z-10" />

      {/* HUD scan line */}
      <div
        className="fixed left-0 right-0 h-px pointer-events-none z-20"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, oklch(0.78 0.2 195 / 0.4) 50%, transparent 100%)",
          animation: "hud-scan 6s linear infinite",
          top: 0,
        }}
      />

      <div className="relative z-30 max-w-2xl mx-auto px-4 py-8 pb-16">
        {/* Header */}
        <header className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-2">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", duration: 0.8 }}
              className="w-10 h-10 rounded-full border border-primary/60 flex items-center justify-center"
              style={{ boxShadow: "0 0 20px oklch(0.78 0.2 195 / 0.4)" }}
            >
              <Cpu size={18} className="text-primary" />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="font-display text-4xl sm:text-5xl font-bold tracking-widest uppercase text-primary"
              style={{ animation: "title-glow 3s ease-in-out infinite" }}
            >
              JARVIS
            </motion.h1>
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="font-mono text-xs tracking-[0.3em] text-muted-foreground uppercase"
          >
            Smart Home Control System
          </motion.p>

          {/* Status bar */}
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-4 flex items-center justify-center gap-6 font-mono text-xs text-muted-foreground"
          >
            <span className="flex items-center gap-1.5">
              <Wifi size={10} className="text-primary" />
              ONLINE
            </span>
            <span className="w-px h-3 bg-border" />
            <span className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full status-dot-on" />
              {activeCount} ACTIVE
            </span>
            <span className="w-px h-3 bg-border" />
            <span>7 DEVICES</span>
          </motion.div>
        </header>

        {/* Microphone Section */}
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col items-center mb-10"
        >
          <div className="relative">
            {/* Pulse rings when active */}
            {isListening && (
              <>
                <div
                  className="absolute inset-0 rounded-full mic-active-ring"
                  style={{ border: "2px solid oklch(0.78 0.2 195 / 0.6)" }}
                />
                <div
                  className="absolute inset-0 rounded-full mic-active-ring"
                  style={{
                    border: "2px solid oklch(0.78 0.2 195 / 0.4)",
                    animationDelay: "0.4s",
                  }}
                />
                <div
                  className="absolute inset-0 rounded-full mic-active-ring"
                  style={{
                    border: "2px solid oklch(0.78 0.2 195 / 0.2)",
                    animationDelay: "0.8s",
                  }}
                />
              </>
            )}

            {SpeechRecognitionAPI ? (
              <button
                data-ocid="jarvis.mic_button"
                type="button"
                onClick={toggleMic}
                className="relative w-24 h-24 rounded-full transition-all duration-300 flex items-center justify-center cursor-pointer"
                style={{
                  background: micActive
                    ? "oklch(0.78 0.2 195 / 0.15)"
                    : "oklch(0.14 0.03 235)",
                  border: `2px solid ${
                    micActive ? "oklch(0.78 0.2 195)" : "oklch(0.25 0.05 235)"
                  }`,
                  boxShadow: micActive
                    ? "0 0 30px oklch(0.78 0.2 195 / 0.5), 0 0 80px oklch(0.78 0.2 195 / 0.2), inset 0 0 20px oklch(0.78 0.2 195 / 0.1)"
                    : "0 0 20px oklch(0 0 0 / 0.3)",
                }}
              >
                {micActive ? (
                  <Mic size={36} className="text-primary" />
                ) : (
                  <MicOff size={36} className="text-muted-foreground" />
                )}
              </button>
            ) : (
              <div className="w-24 h-24 rounded-full bg-muted border border-border flex items-center justify-center">
                <MicOff size={36} className="text-muted-foreground" />
              </div>
            )}
          </div>

          <AnimatePresence mode="wait">
            {isListening ? (
              <motion.p
                key="listening"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="mt-4 font-mono text-sm text-primary tracking-widest uppercase"
                style={{ animation: "flicker 2s ease-in-out infinite" }}
              >
                ◉ Listening...
              </motion.p>
            ) : micActive ? (
              <motion.p
                key="standby"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-4 font-mono text-xs text-primary/60 tracking-widest uppercase"
              >
                ◎ Always On — Say "Hey Jarvis"
              </motion.p>
            ) : (
              <motion.p
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-4 font-mono text-xs text-muted-foreground tracking-widest uppercase"
              >
                {SpeechRecognitionAPI
                  ? "Tap to activate"
                  : "Voice not supported"}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.section>

        {/* Command Panel */}
        <motion.div
          data-ocid="jarvis.command_panel"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mb-8 rounded-lg border border-border bg-card/60 backdrop-blur-sm p-4"
          style={{
            borderColor: lastCommand ? "oklch(0.78 0.2 195 / 0.3)" : undefined,
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-4 rounded-full bg-primary" />
            <span className="font-mono text-xs text-muted-foreground uppercase tracking-widest">
              Last Command
            </span>
          </div>
          <p className="font-mono text-sm text-foreground min-h-[1.5rem]">
            {lastCommand || (
              <span className="text-muted-foreground italic">
                Awaiting voice input...
              </span>
            )}
          </p>

          {/* Status feedback */}
          <AnimatePresence>
            {statusMsg && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 pt-3 border-t border-border"
              >
                <p
                  data-ocid={
                    statusType === "success"
                      ? "jarvis.success_state"
                      : statusType === "error"
                        ? "jarvis.error_state"
                        : "jarvis.loading_state"
                  }
                  className="font-mono text-xs uppercase tracking-widest"
                  style={{
                    color:
                      statusType === "success"
                        ? "oklch(0.78 0.2 195)"
                        : statusType === "error"
                          ? "oklch(0.62 0.22 25)"
                          : "oklch(0.72 0.18 220)",
                  }}
                >
                  {statusType === "success"
                    ? "✓ "
                    : statusType === "error"
                      ? "✗ "
                      : "⟳ "}
                  {statusMsg}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Device Grid */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Power size={14} className="text-primary" />
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Device Controls
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {DEVICES.map((device, idx) => {
              const isOn = devices[device.key];
              const isPending = pendingDevice === device.key;

              return (
                <motion.div
                  key={device.key}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 + idx * 0.07 }}
                >
                  <button
                    data-ocid={device.ocid}
                    type="button"
                    onClick={() => !isPending && sendCommand(device, !isOn)}
                    disabled={isPending}
                    className={`w-full rounded-lg border p-4 flex flex-col items-center gap-3 transition-all duration-300 cursor-pointer disabled:cursor-wait ${
                      isOn ? "device-card-on" : "device-card-off"
                    }`}
                    style={{
                      background: isOn
                        ? "oklch(0.12 0.025 235 / 0.9)"
                        : "oklch(0.11 0.02 235 / 0.7)",
                    }}
                  >
                    {/* Status dot */}
                    <div className="flex items-center justify-between w-full">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          isOn ? "status-dot-on" : "status-dot-off"
                        }`}
                      />
                      <span
                        className="font-mono text-xs uppercase tracking-wider"
                        style={{
                          color: isOn
                            ? "oklch(0.78 0.2 195)"
                            : "oklch(0.4 0.04 235)",
                        }}
                      >
                        {isPending ? "..." : isOn ? "ON" : "OFF"}
                      </span>
                    </div>

                    {/* Icon */}
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300"
                      style={{
                        background: isOn
                          ? "oklch(0.78 0.2 195 / 0.15)"
                          : "oklch(0.16 0.03 235)",
                        color: isOn
                          ? "oklch(0.78 0.2 195)"
                          : "oklch(0.4 0.05 235)",
                        boxShadow: isOn
                          ? "0 0 16px oklch(0.78 0.2 195 / 0.3)"
                          : "none",
                      }}
                    >
                      {device.icon}
                    </div>

                    {/* Label */}
                    <span
                      className="font-display text-sm font-semibold tracking-wide"
                      style={{
                        color: isOn
                          ? "oklch(0.93 0.025 200)"
                          : "oklch(0.5 0.05 230)",
                      }}
                    >
                      {device.label}
                    </span>
                  </button>
                </motion.div>
              );
            })}
          </div>

          {/* All LEDs quick controls */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.35 }}
            className="mt-3 grid grid-cols-2 gap-3"
          >
            <button
              data-ocid="jarvis.all_leds_on_button"
              type="button"
              onClick={() => sendAllLEDs(true)}
              className="rounded-lg border border-border/60 p-3 font-mono text-xs uppercase tracking-widest text-primary hover:border-primary/60 hover:bg-primary/10 transition-all duration-200"
            >
              ⚡ All LEDs ON
            </button>
            <button
              data-ocid="jarvis.all_leds_off_button"
              type="button"
              onClick={() => sendAllLEDs(false)}
              className="rounded-lg border border-border/60 p-3 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:border-border hover:bg-muted/20 transition-all duration-200"
            >
              ○ All LEDs OFF
            </button>
          </motion.div>
        </section>

        {/* Voice command hints */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4 }}
          className="mt-8 rounded-lg border border-border/40 bg-card/30 p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <Mic size={12} className="text-primary" />
            <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Voice Commands
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {[
              '"Hey Jarvis turn on LED 1"',
              '"Hey Jarvis turn off LED 3"',
              '"Hey Jarvis turn on all LEDs"',
              '"Hey Jarvis turn off all LEDs"',
              '"Hey Jarvis open door"',
              '"Hey Jarvis close door"',
              '"Hey Jarvis start motor"',
              '"Hey Jarvis stop motor"',
            ].map((cmd) => (
              <p key={cmd} className="font-mono text-xs text-muted-foreground">
                <span className="text-primary/60">›</span> {cmd}
              </p>
            ))}
          </div>
        </motion.section>

        {/* Footer */}
        <footer className="mt-10 text-center">
          <p className="font-mono text-xs text-muted-foreground">
            © {new Date().getFullYear()}.{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(typeof window !== "undefined" ? window.location.hostname : "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
            >
              Built with ♥ using caffeine.ai
            </a>
          </p>
        </footer>
      </div>

      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          style: {
            background: "oklch(0.12 0.025 235)",
            border: "1px solid oklch(0.22 0.04 235)",
            color: "oklch(0.93 0.025 200)",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: "12px",
          },
        }}
      />
    </div>
  );
}
