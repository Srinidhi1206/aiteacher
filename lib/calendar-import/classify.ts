// Deciding what KIND of calendar event a title describes, from its words only. Pure. When no rule matches the answer is
// "OTHER" with `confident: false`, which the importer shows as "needs review" instead of pretending to know.
import type { AcademicEventType } from "@prisma/client";

const RULES: { type: AcademicEventType; re: RegExp }[] = [
  // Results come first: "Mid-term exam results" is a result, not an exam.
  { type: "RESULT", re: /\b(?:results?|report\s*cards?|marks?\s+(?:declaration|distribution)|progress\s+reports?|merit\s+list)\b/i },
  // ...and meetings before exams: "Parent-teacher meeting after the unit test" is a meeting.
  { type: "MEETING", re: /\b(?:ptm|p\.t\.m|parent[s']*[\s-]*teachers?(?:\s+(?:meeting|meet|conference|interaction))?|parents?\s+meet(?:ing)?|staff\s+meet(?:ing)?|pta|general\s+body)\b|\bmeeting\b/i },
  {
    type: "EXAM",
    re: /\b(?:unit[\s-]*tests?|periodic[\s-]*tests?|pt[\s-]?\d|mid[\s-]*terms?|half[\s-]*yearly|quarterly|annual\s+exam(?:ination)?s?|pre[\s-]*(?:final|board)s?|preparatory|model\s+(?:exam|paper)s?|practical\s+(?:exam|test)s?|slip\s+tests?|revision\s+tests?|exams?|examinations?|tests?|assessments?|fa[\s-]?\d|sa[\s-]?\d|board\s+exams?|olympiad)\b/i,
  },
  { type: "DEADLINE", re: /\b(?:last\s+date|due\s+date|deadline|submission|fees?\s+(?:due|payment)|registration\s+(?:closes|ends|last))\b/i },
  {
    type: "HOLIDAY",
    re: /\b(?:holidays?|vacations?|summer\s+break|winter\s+break|dussehra|dasara|dasera|diwali|deepavali|sankranti|pongal|holi|eid|ramzan|ramadan|bakrid|muharram|christmas|good\s+friday|independence\s+day|republic\s+day|gandhi\s+jayanti|ambedkar\s+jayanti|ugadi|bathukamma|bonalu|ganesh\s+chaturthi|raksha\s+bandhan|onam|school\s+closed|no\s+school|closed)\b/i,
  },
  {
    type: "TERM",
    re: /\b(?:term\s*(?:\d|i{1,3})?\s*(?:begins?|starts?|ends?|commences?|opens?|closes?)|(?:first|second|third|1st|2nd|3rd)\s+term|re-?open(?:s|ing)?|school\s+(?:opens?|begins?|re-?opens?)|commencement|last\s+working\s+day|first\s+day\s+of\s+school|academic\s+(?:year|session)|session\s+(?:begins?|starts?|ends?))\b/i,
  },
  {
    type: "EVENT",
    re: /\b(?:annual\s+day|sports?\s+(?:day|meet)|fest|festival|competitions?|celebrations?|cultural|assembly|orientation|excursion|field\s+trip|trip|fair|exhibition|inauguration|investiture|graduation|farewell|workshop|seminar|camp|drive|quiz|talent|prize\s+distribution)\b/i,
  },
];

export interface Classification {
  type: AcademicEventType;
  confident: boolean;
}

export function classifyEventType(title: string): Classification {
  for (const rule of RULES) if (rule.re.test(title)) return { type: rule.type, confident: true };
  return { type: "OTHER", confident: false };
}
