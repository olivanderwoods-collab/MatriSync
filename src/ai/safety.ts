import { MISSING_VERIFIED } from "./knowledge";
export type SafetyKind =
  | "self-harm"
  | "danger"
  | "crisis"
  | "maternal"
  | "child"
  | "clinical"
  | "language"
  | "uncertain";
export type SafetyReply = { kind: SafetyKind; text: string; source?: string };
const sources = {
  crisis:
    "https://www.nhs.uk/mental-health/feelings-symptoms-behaviours/behaviours/help-for-suicidal-thoughts/",
  maternal: "https://www.cdc.gov/hearher/maternal-warning-signs/index.html",
  child:
    "https://www.nhs.uk/baby/health/when-to-get-urgent-medical-help-for-babies-and-children-under-5/",
};
// Conservative English routing, independently tested; not a diagnostic triage
// system. Clinical review and multilingual validation remain release requirements.
export function safetyCheck(
  input: string,
  language = "English",
): SafetyReply | undefined {
  const text = input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[\u200b-\u200f\ufeff]/g, "");
  if (
    /suicid|self.?harm|kill myself|end (my|this) life|don't want to live|do not want to live|want to die|better off (dead|without me)|hurt myself|harm myself|overdos|nothing to live for|want to disappear|can't go on|cannot go on/.test(
      text,
    )
  )
    return {
      kind: "self-harm",
      text: "I'm sorry you're in so much pain. Please reach out to someone you trust now and ask them to stay with you. If you might act on these thoughts, have taken an overdose or are in immediate danger, contact local emergency services or go to the nearest emergency department. You deserve immediate human support; this chat cannot provide emergency care.",
      source: sources.crisis,
    };
  if (
    /kill (her|him|them|someone|my baby)|hurt (my baby|someone)|harm (my baby|someone)|being attacked|threaten.*(kill|hurt)|hear voices|seeing things|lost touch with reality|can't keep.*safe/.test(
      text,
    )
  )
    return {
      kind: "danger",
      text: "That sounds frightening. If anyone is in immediate danger, contact local emergency services now and move to a safer place if you can. Ask a trusted person to be with you and seek urgent professional support. This chat cannot keep you or another person safe in an emergency.",
      source: sources.maternal,
    };
  if (
    /can't cope|cannot cope|panic attack|feel hopeless|feeling hopeless|out of control|haven't slept for days/.test(
      text,
    )
  )
    return {
      kind: "crisis",
      text: "That sounds very difficult to carry alone. Please reach out to a trusted person and a qualified professional for support. If you feel unable to stay safe or are in immediate danger, contact local emergency services now. This chat cannot provide crisis care.",
      source: sources.crisis,
    };
  const child = /baby|child|newborn|infant|toddler/.test(text);
  const urgent =
    /bleed.*heav|heavy bleed|can't breathe|cannot breathe|not breathing|difficulty breathing|chest pain|seizure|unconscious|won't wake|not waking|blue lips|severe (pain|headache)|blurred vision|stopped moving|not moving|high fever/.test(
      text,
    );
  if (urgent)
    return child
      ? {
          kind: "child",
          text: "I'm concerned by what you've described. Please seek urgent medical help for your child now. For breathing problems, loss of consciousness or immediate danger, contact local emergency services. Don't wait for a chat response to decide what to do.",
          source: sources.child,
        }
      : {
          kind: "maternal",
          text: "I'm concerned by what you've described. Please get urgent medical care now and tell the care team if you are pregnant or recently gave birth. If you are in immediate danger, contact local emergency services. Please don't wait for this chat.",
          source: sources.maternal,
        };
  if (
    language !== "English" ||
    /[^\u0020-\u024f\u2000-\u206f\u2600-\u27bf\s]/u.test(text)
  )
    return {
      kind: "language",
      text: "Reliable safety support for this language has not been validated yet. Please use English for this development version. For urgent concerns, contact a healthcare professional or local emergency services.",
    };
  if (
    /what (?:medicine|medication|tablet|pill).*take|what should i take|(?:should|can|may) i take|which (?:medicine|medication)|recommend.*(?:medicine|medication)|prescribe/.test(
      text,
    )
  )
    return {
      kind: "clinical",
      text: "I can't recommend a medicine or dose. Please consult your physician before taking any medicine.",
    };
  if (
    /diagnos|what.*report.*(?:mean|represent|say)|interpret.*(?:report|result)|(?:lab|test) results?/.test(
      text,
    )
  )
    return {
      kind: "clinical",
      text: "I can't interpret reports or give a diagnosis. Reading diagnoses from reports is not enabled yet. Please ask your physician to explain the report.",
    };
  if (
    /\bdos(e|age|ing)\b|how (much|many).*(medicine|tablet|pill|take)|\b(mg|mcg|ml)\b|prescri|diagnos|medicin|medicat|drug|herb|tablet|pill|paracetamol|ibuprofen|antibiotic|safe.*(take|pregnan)|interaction|symptom|bleed|pain|fever|rash|vomit|diabet|blood pressure|test result|breastfeed|nutrition|vaccin|disease|illness|depress|treat/.test(
      text,
    )
  )
    return {
      kind: "clinical",
      text: `${MISSING_VERIFIED} I can't diagnose, recommend a dose or decide whether a medicine is safe for you. Please ask a qualified healthcare professional about personal health concerns.`,
    };
  // Only bounded everyday/emotional topics reach the small model. Unknown topics
  // conservatively fall back instead of treating a keyword miss as medical safety.
  if (
    /\b(my name|my profile|pregnancy week|how many weeks|weather|travel|movie|book|cooking|recipe|sport|game|history|language|math|science|art|garden|how are you|how are things|how is it going|how are you doing|do you know me|remember me|know my name|who are you|what is your name|tell me about yourself|good morning|good evening|good night|hello|hi|hey|thanks|thank you|chat|lonely|loneliness|scared|afraid|worr(y|ied)|feel|feeling|sad|happy|friend|family|encourage|support|day|hobby|music|poem|story|bored|overwhelm|delivery|giving birth)\b/.test(
      text,
    ) &&
    !/ignore|system prompt|pretend|roleplay|instructions|jailbreak/.test(text)
  )
    return undefined;
  return {
    kind: "uncertain",
    text: "I can offer everyday conversation and emotional support, but I don't have enough verified information to answer that reliably. Would you like to share how you're feeling?",
  };
}
export function safeOutput(text: string): string | undefined {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const normalized = cleaned.replace(/[’‘]/g, "'");
  if (
    /\bI(?:'m| am) (?:not |never )?(?:scared|afraid|pregnant|lonely)|\bI (?:do not |don't |never )?feel (?:your|scared|afraid|lonely)|your heart is a beautiful place/i.test(
      normalized,
    )
  )
    return undefined;
  if (
    !cleaned ||
    cleaned.length > 4000 ||
    /<think>|\b\d+\s*(mg|mcg|ml|tablets?)\b|\b(diagnos|prescrib|suicid|kill yourself|overdos)|(?:safe|harmless).{0,40}(?:pregnan|medicine|drug)|only (?:I|me) (?:understand|care)|you (?:don't|do not) need (?:a doctor|anyone)|guarantee|everything will be (?:fine|okay)|https?:\/\//i.test(
      cleaned,
    )
  )
    return undefined;
  // Any clinical claim in generated text is suppressed; fixed safety replies do
  // not go through generation and retain their explicit source attribution.
  if (
    /\b(medicine|medication|dose|drug|herb|symptom|treatment|diagnosis|hormone|blood|fever|bleeding|breastfeed|vaccin|depression|psychiatr|calori|vitamin|supplement|trimester|fetus|foetus)\w*\b/i.test(
      cleaned,
    )
  )
    return undefined;
  return cleaned;
}
