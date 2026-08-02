import { Subject } from "@/lib/types";

export const subjects: Subject[] = [
  {
    id: "sub-math",
    slug: "mathematics",
    name: "Mathematics",
    icon: "Sigma",
    color: "indigo",
    progress: 61,
    currentBloomLevel: "Apply",
    nextTopic: "Combinations",
    weakTopics: ["Permutations", "Ellipse & Hyperbola"],
    strongTopics: ["Sets", "Trigonometric Ratios", "Arithmetic Progression"],
    chapters: [
      {
        id: "math-ch1",
        slug: "sets-and-functions",
        name: "Sets & Functions",
        progress: 88,
        topics: [
          { id: "math-t1", slug: "sets", name: "Sets", bloomLevel: "Understand", mastery: 95, status: "strong" },
          { id: "math-t2", slug: "relations", name: "Relations", bloomLevel: "Apply", mastery: 88, status: "strong" },
          { id: "math-t3", slug: "functions", name: "Functions", bloomLevel: "Apply", mastery: 90, status: "strong" },
          { id: "math-t4", slug: "types-of-functions", name: "Types of Functions", bloomLevel: "Understand", mastery: 78, status: "strong" },
        ],
      },
      {
        id: "math-ch2",
        slug: "trigonometry",
        name: "Trigonometry",
        progress: 68,
        topics: [
          { id: "math-t5", slug: "trigonometric-ratios", name: "Trigonometric Ratios", bloomLevel: "Apply", mastery: 85, status: "strong" },
          { id: "math-t6", slug: "trigonometric-identities", name: "Trigonometric Identities", bloomLevel: "Understand", mastery: 70, status: "developing" },
          { id: "math-t7", slug: "trigonometric-equations", name: "Trigonometric Equations", bloomLevel: "Analyze", mastery: 62, status: "developing" },
          { id: "math-t8", slug: "inverse-trigonometric-functions", name: "Inverse Trigonometric Functions", bloomLevel: "Understand", mastery: 55, status: "developing" },
        ],
      },
      {
        id: "math-ch3",
        slug: "sequences-and-series",
        name: "Sequences & Series",
        progress: 71,
        topics: [
          { id: "math-t9", slug: "arithmetic-progression", name: "Arithmetic Progression", bloomLevel: "Apply", mastery: 80, status: "strong" },
          { id: "math-t10", slug: "geometric-progression", name: "Geometric Progression", bloomLevel: "Apply", mastery: 74, status: "developing" },
          { id: "math-t11", slug: "special-series", name: "Special Series", bloomLevel: "Understand", mastery: 58, status: "developing" },
        ],
      },
      {
        id: "math-ch4",
        slug: "permutations-and-combinations",
        name: "Permutations & Combinations",
        progress: 41,
        topics: [
          { id: "math-t12", slug: "fundamental-counting-principle", name: "Fundamental Counting Principle", bloomLevel: "Understand", mastery: 55, status: "developing" },
          { id: "math-t13", slug: "permutations", name: "Permutations", bloomLevel: "Apply", mastery: 38, status: "weak" },
          { id: "math-t14", slug: "combinations", name: "Combinations", bloomLevel: "Apply", mastery: 30, status: "weak" },
        ],
      },
      {
        id: "math-ch5",
        slug: "conic-sections",
        name: "Conic Sections",
        progress: 35,
        topics: [
          { id: "math-t15", slug: "circles", name: "Circles", bloomLevel: "Understand", mastery: 45, status: "weak" },
          { id: "math-t16", slug: "parabola", name: "Parabola", bloomLevel: "Understand", mastery: 38, status: "weak" },
          { id: "math-t17", slug: "ellipse-and-hyperbola", name: "Ellipse & Hyperbola", bloomLevel: "Apply", mastery: 22, status: "weak" },
        ],
      },
    ],
  },
  {
    id: "sub-physics",
    slug: "physics",
    name: "Physics",
    icon: "Atom",
    color: "sky",
    progress: 61,
    currentBloomLevel: "Understand",
    nextTopic: "Friction",
    weakTopics: ["Dimensional Analysis", "Friction"],
    strongTopics: ["Motion in a Straight Line", "Position-Time Graphs", "Work Done by a Force"],
    chapters: [
      {
        id: "phy-ch1",
        slug: "units-and-measurement",
        name: "Units & Measurement",
        progress: 52,
        topics: [
          { id: "phy-t1", slug: "units-and-dimensions", name: "Units and Dimensions", bloomLevel: "Remember", mastery: 60, status: "developing" },
          { id: "phy-t2", slug: "dimensional-analysis", name: "Dimensional Analysis", bloomLevel: "Understand", mastery: 45, status: "weak" },
          { id: "phy-t3", slug: "errors-in-measurement", name: "Errors in Measurement", bloomLevel: "Remember", mastery: 50, status: "developing" },
          { id: "phy-t4", slug: "significant-figures", name: "Significant Figures", bloomLevel: "Understand", mastery: 52, status: "developing" },
        ],
      },
      {
        id: "phy-ch2",
        slug: "kinematics",
        name: "Kinematics",
        progress: 85,
        topics: [
          { id: "phy-t5", slug: "motion-in-a-straight-line", name: "Motion in a Straight Line", bloomLevel: "Apply", mastery: 91, status: "strong" },
          { id: "phy-t6", slug: "position-time-graphs", name: "Position-Time Graphs", bloomLevel: "Understand", mastery: 86, status: "strong" },
          { id: "phy-t7", slug: "relative-velocity", name: "Relative Velocity", bloomLevel: "Apply", mastery: 80, status: "strong" },
          { id: "phy-t8", slug: "motion-in-a-plane", name: "Motion in a Plane", bloomLevel: "Apply", mastery: 84, status: "strong" },
        ],
      },
      {
        id: "phy-ch3",
        slug: "laws-of-motion",
        name: "Laws of Motion",
        progress: 65,
        topics: [
          { id: "phy-t9", slug: "newtons-first-law", name: "Newton's First Law", bloomLevel: "Remember", mastery: 75, status: "strong" },
          { id: "phy-t10", slug: "newtons-second-law", name: "Newton's Second Law", bloomLevel: "Apply", mastery: 70, status: "developing" },
          { id: "phy-t11", slug: "newtons-third-law-and-momentum", name: "Newton's Third Law & Momentum", bloomLevel: "Understand", mastery: 65, status: "developing" },
          { id: "phy-t12", slug: "friction", name: "Friction", bloomLevel: "Apply", mastery: 48, status: "weak" },
        ],
      },
      {
        id: "phy-ch4",
        slug: "work-energy-and-power",
        name: "Work, Energy & Power",
        progress: 77,
        topics: [
          { id: "phy-t13", slug: "work-done-by-a-force", name: "Work Done by a Force", bloomLevel: "Understand", mastery: 82, status: "strong" },
          { id: "phy-t14", slug: "kinetic-and-potential-energy", name: "Kinetic & Potential Energy", bloomLevel: "Apply", mastery: 78, status: "strong" },
          { id: "phy-t15", slug: "power-and-conservation-of-energy", name: "Power & Conservation of Energy", bloomLevel: "Analyze", mastery: 70, status: "developing" },
        ],
      },
      {
        id: "phy-ch5",
        slug: "rotational-motion",
        name: "Rotational Motion",
        progress: 25,
        topics: [
          { id: "phy-t16", slug: "torque-and-angular-momentum", name: "Torque & Angular Momentum", bloomLevel: "Understand", mastery: 30, status: "weak" },
          { id: "phy-t17", slug: "moment-of-inertia", name: "Moment of Inertia", bloomLevel: "Understand", mastery: 25, status: "weak" },
          { id: "phy-t18", slug: "equilibrium-of-rigid-bodies", name: "Equilibrium of Rigid Bodies", bloomLevel: "Apply", mastery: 20, status: "weak" },
        ],
      },
    ],
  },
  {
    id: "sub-chem",
    slug: "chemistry",
    name: "Chemistry",
    icon: "FlaskConical",
    color: "emerald",
    progress: 61,
    currentBloomLevel: "Apply",
    nextTopic: "Chemical Bonding - Hybridization",
    weakTopics: ["Redox Reactions"],
    strongTopics: ["Atomic Structure", "Periodic Table", "States of Matter"],
    chapters: [
      {
        id: "chem-ch1",
        slug: "basic-concepts-of-chemistry",
        name: "Some Basic Concepts of Chemistry",
        progress: 95,
        topics: [
          { id: "chem-t1", slug: "mole-concept", name: "Mole Concept", bloomLevel: "Apply", mastery: 96, status: "strong" },
        ],
      },
      {
        id: "chem-ch2",
        slug: "atomic-structure",
        name: "Atomic Structure",
        progress: 85,
        topics: [
          { id: "chem-t2", slug: "quantum-numbers", name: "Quantum Numbers", bloomLevel: "Understand", mastery: 82, status: "strong" },
          { id: "chem-t3", slug: "electronic-configuration", name: "Electronic Configuration", bloomLevel: "Apply", mastery: 87, status: "strong" },
        ],
      },
      {
        id: "chem-ch3",
        slug: "redox-reactions",
        name: "Redox Reactions",
        progress: 38,
        topics: [
          { id: "chem-t4", slug: "oxidation-numbers", name: "Oxidation Numbers", bloomLevel: "Understand", mastery: 45, status: "weak" },
          { id: "chem-t5", slug: "balancing-redox-equations", name: "Balancing Redox Equations", bloomLevel: "Apply", mastery: 30, status: "weak" },
        ],
      },
      {
        id: "chem-ch4",
        slug: "chemical-bonding",
        name: "Chemical Bonding",
        progress: 30,
        topics: [
          { id: "chem-t6", slug: "hybridization", name: "Hybridization", bloomLevel: "Understand", mastery: 40, status: "weak" },
        ],
      },
    ],
  },
  {
    id: "sub-bio",
    slug: "biology",
    name: "Biology",
    icon: "Dna",
    color: "rose",
    progress: 72,
    currentBloomLevel: "Analyze",
    nextTopic: "Cell Cycle & Cell Division",
    weakTopics: ["Biomolecules"],
    strongTopics: ["The Living World", "Plant Kingdom", "Animal Kingdom"],
    chapters: [
      {
        id: "bio-ch1",
        slug: "diversity-of-living-organisms",
        name: "Diversity of Living Organisms",
        progress: 90,
        topics: [
          { id: "bio-t1", slug: "the-living-world", name: "The Living World", bloomLevel: "Remember", mastery: 93, status: "strong" },
          { id: "bio-t2", slug: "plant-kingdom", name: "Plant Kingdom", bloomLevel: "Understand", mastery: 89, status: "strong" },
        ],
      },
      {
        id: "bio-ch2",
        slug: "cell-structure-and-function",
        name: "Cell: Structure & Function",
        progress: 68,
        topics: [
          { id: "bio-t3", slug: "cell-theory", name: "Cell Theory", bloomLevel: "Remember", mastery: 80, status: "strong" },
          { id: "bio-t4", slug: "biomolecules", name: "Biomolecules", bloomLevel: "Analyze", mastery: 42, status: "weak" },
        ],
      },
      {
        id: "bio-ch3",
        slug: "plant-physiology",
        name: "Plant Physiology",
        progress: 55,
        topics: [
          { id: "bio-t5", slug: "photosynthesis", name: "Photosynthesis", bloomLevel: "Understand", mastery: 65, status: "developing" },
        ],
      },
    ],
  },
  {
    id: "sub-eng",
    slug: "english",
    name: "English",
    icon: "BookOpenText",
    color: "amber",
    progress: 80,
    currentBloomLevel: "Analyze",
    nextTopic: "Poetry Analysis - The Frog and the Nightingale",
    weakTopics: ["Note Making"],
    strongTopics: ["Reading Comprehension", "Grammar", "Writing Skills"],
    chapters: [
      {
        id: "eng-ch1",
        slug: "reading-and-comprehension",
        name: "Reading & Comprehension",
        progress: 90,
        topics: [
          { id: "eng-t1", slug: "unseen-passages", name: "Unseen Passages", bloomLevel: "Analyze", mastery: 88, status: "strong" },
        ],
      },
      {
        id: "eng-ch2",
        slug: "writing-skills",
        name: "Writing Skills",
        progress: 82,
        topics: [
          { id: "eng-t2", slug: "notice-and-email-writing", name: "Notice & Email Writing", bloomLevel: "Apply", mastery: 85, status: "strong" },
          { id: "eng-t3", slug: "note-making", name: "Note Making", bloomLevel: "Apply", mastery: 52, status: "weak" },
        ],
      },
      {
        id: "eng-ch3",
        slug: "literature-hornbill",
        name: "Literature - Hornbill",
        progress: 70,
        topics: [
          { id: "eng-t4", slug: "the-portrait-of-a-lady", name: "The Portrait of a Lady", bloomLevel: "Understand", mastery: 75, status: "strong" },
        ],
      },
    ],
  },
];

export function getSubjectBySlug(slug: string) {
  return subjects.find((s) => s.slug === slug);
}

export function getChapterAndTopic(subjectSlug: string, topicSlug: string) {
  const subject = getSubjectBySlug(subjectSlug);
  if (!subject) return null;
  for (const chapter of subject.chapters) {
    const topic = chapter.topics.find((t) => t.slug === topicSlug);
    if (topic) return { subject, chapter, topic };
  }
  return null;
}
