import { useApp } from "./state";

export type Lang = "English" | "Hindi" | "Telugu";

const T: Record<string, Record<Lang, string>> = {
  hello: { English: "Hello", Hindi: "नमस्ते", Telugu: "నమస్కారం" },
  next_appt: { English: "Your next appointment", Hindi: "आपकी अगली अपॉइंटमेंट", Telugu: "మీ తదుపరి అపాయింట్‌మెంట్" },
  book: { English: "Book an appointment", Hindi: "अपॉइंटमेंट बुक करें", Telugu: "అపాయింట్‌మెంట్ బుక్ చేయండి" },
  find_doctor: { English: "Find a doctor", Hindi: "डॉक्टर खोजें", Telugu: "డాక్టర్‌ను కనుగొనండి" },
  my_appts: { English: "My appointments", Hindi: "मेरी अपॉइंटमेंट", Telugu: "నా అపాయింట్‌మెంట్లు" },
  my_visits: { English: "My visits", Hindi: "मेरी विज़िट", Telugu: "నా సందర్శనలు" },
  check_in: { English: "Check in", Hindi: "चेक-इन करें", Telugu: "చెక్-ఇన్ చేయండి" },
  expected_wait: { English: "Expected wait", Hindi: "अनुमानित प्रतीक्षा", Telugu: "అంచనా నిరీక్షణ" },
  position: { English: "Your position", Hindi: "आपका स्थान", Telugu: "మీ స్థానం" },
  people_ahead: { English: "people ahead of you", Hindi: "लोग आपसे आगे", Telugu: "మందు మీ ముందున్నారు" },
  running_late: { English: "Doctor is running late", Hindi: "डॉक्टर देरी से चल रहे हैं", Telugu: "డాక్టర్ ఆలస్యంగా ఉన్నారు" },
  on_time: { English: "Doctor is on time", Hindi: "डॉक्टर समय पर हैं", Telugu: "డాక్టర్ సమయానికి ఉన్నారు" },
  your_turn: { English: "It's your turn", Hindi: "आपकी बारी है", Telugu: "మీ వంతు వచ్చింది" },
  department: { English: "Department", Hindi: "विभाग", Telugu: "విభాగం" },
  doctor: { English: "Doctor", Hindi: "डॉक्टर", Telugu: "డాక్టర్" },
  any_doctor: { English: "Any doctor", Hindi: "कोई भी डॉक्टर", Telugu: "ఏ డాక్టర్ అయినా" },
  choose_slot: { English: "Choose a time", Hindi: "समय चुनें", Telugu: "సమయాన్ని ఎంచుకోండి" },
  confirm: { English: "Confirm booking", Hindi: "बुकिंग की पुष्टि करें", Telugu: "బుకింగ్ నిర్ధారించండి" },
  recommended: { English: "Recommended", Hindi: "सुझाया गया", Telugu: "సిఫార్సు" },
  join_waitlist: { English: "Join waitlist", Hindi: "प्रतीक्षा सूची में जुड़ें", Telugu: "వెయిటింగ్ లిస్ట్‌లో చేరండి" },
  reschedule: { English: "Reschedule", Hindi: "समय बदलें", Telugu: "సమయం మార్చండి" },
  cancel: { English: "Cancel", Hindi: "रद्द करें", Telugu: "రద్దు చేయండి" },
  upcoming: { English: "Upcoming", Hindi: "आगामी", Telugu: "రాబోయేవి" },
  past: { English: "Past", Hindi: "पिछली", Telugu: "గతవి" },
  follow_up: { English: "Time for a follow-up", Hindi: "फॉलो-अप का समय", Telugu: "ఫాలో-అప్ సమయం" },
  best_arrival: { English: "Best time to arrive", Hindi: "पहुँचने का सबसे अच्छा समय", Telugu: "రావడానికి ఉత్తమ సమయం" },
  bring: { English: "Please bring", Hindi: "कृपया साथ लाएँ", Telugu: "దయచేసి తీసుకురండి" },
  rate_visit: { English: "Rate your visit", Hindi: "अपनी विज़िट को रेट करें", Telugu: "మీ సందర్శనను రేట్ చేయండి" },
  wait_board: { English: "Live wait times", Hindi: "लाइव प्रतीक्षा समय", Telugu: "ప్రత్యక్ష నిరీక్షణ సమయాలు" },
  minutes: { English: "min", Hindi: "मिनट", Telugu: "ని." },
  speaks: { English: "Speaks", Hindi: "भाषाएँ", Telugu: "మాట్లాడే భాషలు" },
  next_free: { English: "Next free", Hindi: "अगला खाली", Telugu: "తదుపరి ఖాళీ" },
};

export function useT() {
  const { lang } = useApp();
  return (k: keyof typeof T | string) => T[k]?.[lang as Lang] ?? T[k]?.English ?? k;
}
export const langClass = (l: string) => (l === "Telugu" ? "lang-te" : l === "Hindi" ? "lang-hi" : "");
