import { AttemptQuestionResult, AttemptResult, Paper, PaperQuestion } from "@/lib/types";

function bloomDistribution(questions: PaperQuestion[]) {
  const counts = [0, 0, 0, 0];
  questions.forEach((q) => counts[q.bloomLevel - 1]++);
  return ([1, 2, 3, 4] as const).filter((l) => counts[l - 1] > 0).map((l) => ({ level: l, count: counts[l - 1] }));
}

function definePaper(p: Omit<Paper, "questionCount" | "totalMarks" | "bloomDistribution">): Paper {
  return {
    ...p,
    questionCount: p.questions.length,
    totalMarks: p.questions.reduce((s, q) => s + q.marks, 0),
    bloomDistribution: bloomDistribution(p.questions),
  };
}

export const papers: Paper[] = [
  definePaper({
    id: "paper-math-ch-trig",
    title: "Mathematics Chapter Test: Trigonometry",
    type: "Chapter Test",
    subject: "Mathematics",
    topics: ["Trigonometric Ratios", "Trigonometric Equations", "Inverse Trigonometric Functions"],
    durationMinutes: 45,
    difficulty: "Medium",
    questions: [
      { id: "q1", type: "mcq", bloomLevel: 1, marks: 3, topic: "Trigonometric Ratios", prompt: "The value of sin 90° is:", options: ["0", "1", "1/2", "undefined"], correctAnswer: "1", explanation: "sin 90° = 1, the maximum value of sine, occurring at the top of the unit circle.", improvementTip: "Memorize the standard angle table for 0°, 30°, 45°, 60°, 90°." },
      { id: "q2", type: "mcq", bloomLevel: 1, marks: 3, topic: "Trigonometric Ratios", prompt: "Which trigonometric ratio equals adjacent/hypotenuse?", options: ["sin θ", "cos θ", "tan θ", "cot θ"], correctAnswer: "cos θ", explanation: "By definition, cos θ = adjacent/hypotenuse.", improvementTip: "Revisit SOH-CAH-TOA to fix the ratio-side pairings." },
      { id: "q3", type: "fill-blank", bloomLevel: 2, marks: 3, topic: "Trigonometric Ratios", prompt: "cosec θ is the reciprocal of ___", correctAnswer: "sin θ", explanation: "cosec θ = 1/sin θ by definition.", improvementTip: "Review the three reciprocal ratio pairs: sin↔cosec, cos↔sec, tan↔cot." },
      { id: "q4", type: "true-false", bloomLevel: 2, marks: 2, topic: "Trigonometric Ratios", prompt: "tan θ is undefined when cos θ = 0.", correctAnswer: "True", explanation: "Since tan θ = sin θ/cos θ, division by zero occurs when cos θ = 0 (e.g. θ = 90°).", improvementTip: "Check where each ratio's denominator becomes zero to identify undefined points." },
      { id: "q5", type: "short-answer", bloomLevel: 3, marks: 5, topic: "Trigonometric Equations", prompt: "Solve: 2 sin θ − 1 = 0 for 0° ≤ θ ≤ 90°.", correctAnswer: "θ = 30°", explanation: "2 sin θ = 1 → sin θ = 1/2 → θ = 30° in the given range.", improvementTip: "Isolate the trig ratio first, then recall which standard angle gives that value." },
      { id: "q6", type: "long-answer", bloomLevel: 3, marks: 8, topic: "Trigonometric Ratios", prompt: "Derive the value of tan 60° using an equilateral triangle, showing all steps.", correctAnswer: "tan 60° = √3, derived by bisecting an equilateral triangle of side 2 into two 30-60-90 triangles with sides 1, √3, 2.", explanation: "Bisecting an equilateral triangle of side 2 gives a right triangle with base 1, height √3 (Pythagoras), and hypotenuse 2. tan 60° = opposite/adjacent = √3/1 = √3.", improvementTip: "Practice deriving all standard angle values from the equilateral and isosceles right triangles rather than only memorizing them." },
      { id: "q7", type: "case-study", bloomLevel: 4, marks: 8, topic: "Trigonometric Ratios", scenario: "A surveyor stands 40 m from the base of a tower and measures the angle of elevation to the top as 45°.", prompt: "If tan 45° = 1, find the height of the tower, and explain what happens to the measured angle of elevation as the observer moves further away.", correctAnswer: "Height = 40 m; the angle of elevation decreases as the observer moves further away.", explanation: "height = distance × tan(angle) = 40 × tan 45° = 40 × 1 = 40 m. As distance increases while height stays fixed, tan θ (and therefore θ) must decrease.", improvementTip: "Always express height/distance relationships as tan θ = opposite/adjacent, then reason about how each variable changes independently." },
      { id: "q8", type: "diagram", bloomLevel: 4, marks: 8, topic: "Trigonometric Ratios", diagramCaption: "A right triangle with the angle of elevation θ marked at the base, height h opposite, and horizontal distance d adjacent.", prompt: "Label the diagram correctly, write the relation connecting h, d, and θ, and use it to find θ if h = 10 m and d = 10√3 m.", correctAnswer: "θ = 30°, from tan θ = h/d = 10/(10√3) = 1/√3.", explanation: "tan θ = opposite/adjacent = h/d. Substituting the given values gives tan θ = 1/√3, which corresponds to θ = 30°.", improvementTip: "When given a diagram, first identify which side is opposite and which is adjacent to the marked angle before writing the ratio." },
    ],
  }),
  definePaper({
    id: "paper-phy-wk-laws",
    title: "Physics Weekly Test: Laws of Motion",
    type: "Weekly Test",
    subject: "Physics",
    topics: ["Newton's First Law", "Newton's Second Law", "Friction"],
    durationMinutes: 40,
    difficulty: "Medium",
    questions: [
      { id: "q1", type: "mcq", bloomLevel: 1, marks: 2, topic: "Newton's First Law", prompt: "Newton's First Law is also known as the law of:", options: ["Momentum", "Inertia", "Acceleration", "Action-Reaction"], correctAnswer: "Inertia", explanation: "Newton's First Law states objects resist changes to their state of motion — this property is called inertia.", improvementTip: "Associate each of Newton's three laws with its common name: 1st = Inertia, 2nd = F=ma, 3rd = Action-Reaction." },
      { id: "q2", type: "true-false", bloomLevel: 1, marks: 2, topic: "Newton's Second Law", prompt: "F = ma applies only when the mass of the object is constant.", correctAnswer: "True", explanation: "For variable-mass systems (like rockets losing fuel), the more general form F = dp/dt must be used instead.", improvementTip: "Remember F = ma is a special case of F = dp/dt valid only for constant mass." },
      { id: "q3", type: "fill-blank", bloomLevel: 2, marks: 3, topic: "Newton's Second Law", prompt: "The SI unit of force, the Newton, is equivalent to ___ kg·m/s².", correctAnswer: "1", explanation: "1 Newton = 1 kg·m/s², directly from F=ma with m=1 kg and a=1 m/s².", improvementTip: "Memorize the base-unit derivation of the Newton from F=ma." },
      { id: "q4", type: "mcq", bloomLevel: 2, marks: 3, topic: "Friction", prompt: "Which of these reduces friction the most effectively?", options: ["Increasing normal force", "Using a lubricant", "Increasing contact area", "Increasing surface roughness"], correctAnswer: "Using a lubricant", explanation: "Lubricants create a thin film between surfaces, greatly reducing the interlocking of microscopic irregularities that causes friction.", improvementTip: "Review how lubrication, roughness, and normal force each affect friction via f=μN." },
      { id: "q5", type: "short-answer", bloomLevel: 3, marks: 4, topic: "Newton's Second Law", prompt: "A 3 kg object accelerates at 4 m/s² under an applied force. Find the force, showing your working.", correctAnswer: "F = 12 N", explanation: "F = ma = 3 × 4 = 12 N.", improvementTip: "Always substitute known values directly into F=ma and keep units consistent." },
      { id: "q6", type: "long-answer", bloomLevel: 3, marks: 6, topic: "Friction", prompt: "A 15 kg box rests on a floor with μₛ=0.5 and μₖ=0.4. Explain, with calculations, the force needed to (a) just start the box moving and (b) keep it moving at constant velocity (g=10 m/s²).", correctAnswer: "(a) 75 N  (b) 60 N", explanation: "N=mg=150N. (a) To start motion: F=μₛN=0.5×150=75N. (b) To maintain constant velocity: F=μₖN=0.4×150=60N.", improvementTip: "Always distinguish the static case (starting motion, use μₛ) from the kinetic case (already moving, use μₖ)." },
      { id: "q7", type: "case-study", bloomLevel: 4, marks: 5, topic: "Newton's Second Law", scenario: "Two blocks of mass 4 kg and 6 kg are connected by a light string and pulled across a frictionless floor by a horizontal force of 20 N applied to the 6 kg block.", prompt: "Find the acceleration of the system and the tension in the connecting string.", correctAnswer: "a = 2 m/s², T = 8 N", explanation: "Total mass = 10 kg, so a = F/m_total = 20/10 = 2 m/s². For the 4 kg block, T = ma = 4×2 = 8 N.", improvementTip: "For connected systems, first find overall acceleration using total mass, then isolate one block to find internal forces like tension." },
      { id: "q8", type: "diagram", bloomLevel: 4, marks: 5, topic: "Friction", diagramCaption: "A block on an inclined plane at angle θ, with gravity resolved into mg sin θ (along incline) and mg cos θ (perpendicular), and friction force f acting up the incline.", prompt: "Using the diagram, derive the condition (in terms of θ and μₛ) for the block to remain stationary on the incline.", correctAnswer: "tan θ ≤ μₛ", explanation: "The block remains stationary as long as mg sin θ ≤ μₛ mg cos θ, which simplifies to tan θ ≤ μₛ.", improvementTip: "Always resolve gravity into components along and perpendicular to the incline before comparing driving force and maximum friction." },
    ],
  }),
  definePaper({
    id: "paper-math-monthly",
    title: "Mathematics Monthly Test: Sets, Trigonometry & Sequences",
    type: "Monthly Test",
    subject: "Mathematics",
    topics: ["Sets", "Trigonometric Ratios", "Arithmetic Progression", "Geometric Progression"],
    durationMinutes: 60,
    difficulty: "Mixed",
    questions: [
      { id: "q1", type: "mcq", bloomLevel: 1, marks: 3, topic: "Sets", prompt: "Which of the following represents the empty set?", options: ["{0}", "{ }", "{1}", "{x : x = x}"], correctAnswer: "{ }", explanation: "The empty set has zero elements and is written as { } or ∅.", improvementTip: "Don't confuse {0} (one element) with the empty set." },
      { id: "q2", type: "true-false", bloomLevel: 1, marks: 2, topic: "Trigonometric Ratios", prompt: "cos 0° = 1.", correctAnswer: "True", explanation: "At θ=0°, the adjacent side equals the hypotenuse, so cos 0° = 1.", improvementTip: "Memorize the standard angle table." },
      { id: "q3", type: "fill-blank", bloomLevel: 2, marks: 3, topic: "Arithmetic Progression", prompt: "In an AP with a=2 and d=3, the 5th term is ___", correctAnswer: "14", explanation: "a₅ = 2 + 4(3) = 14.", improvementTip: "Use aₙ=a+(n−1)d directly." },
      { id: "q4", type: "mcq", bloomLevel: 2, marks: 3, topic: "Geometric Progression", prompt: "In a GP, if a=3 and r=2, the 4th term is:", options: ["24", "18", "12", "6"], correctAnswer: "24", explanation: "aₙ=ar^(n−1); a₄=3×2³=24.", improvementTip: "Recall the GP nth term formula aₙ=ar^(n−1)." },
      { id: "q5", type: "short-answer", bloomLevel: 3, marks: 5, topic: "Sets", prompt: "If n(A)=20, n(B)=15, n(A∩B)=8, find n(A∪B).", correctAnswer: "27", explanation: "n(A∪B)=n(A)+n(B)−n(A∩B)=20+15−8=27.", improvementTip: "Always subtract the intersection once to avoid double counting." },
      { id: "q6", type: "short-answer", bloomLevel: 3, marks: 5, topic: "Trigonometric Ratios", prompt: "If tan θ = 1, find θ in the range 0°–90°.", correctAnswer: "45°", explanation: "tan 45° = 1, a standard angle value.", improvementTip: "Memorize tan values for standard angles." },
      { id: "q7", type: "long-answer", bloomLevel: 3, marks: 8, topic: "Arithmetic Progression", prompt: "Find the sum of the first 25 terms of the AP 7, 10, 13, ...", correctAnswer: "S₂₅ = 1075", explanation: "a=7, d=3, n=25. Sₙ=n/2[2a+(n−1)d]=12.5×[14+72]=12.5×86=1075.", improvementTip: "Substitute carefully into Sₙ=n/2[2a+(n−1)d] and double check arithmetic." },
      { id: "q8", type: "mcq", bloomLevel: 4, marks: 4, topic: "Geometric Progression", prompt: "A GP has first term 5 and common ratio 1/2. What happens to the sum to infinity?", options: ["It diverges to infinity", "It converges to 10", "It converges to 5", "It equals zero"], correctAnswer: "It converges to 10", explanation: "Sum to infinity = a/(1−r) = 5/0.5 = 10, valid since |r|<1.", improvementTip: "The sum-to-infinity formula a/(1−r) only applies when |r|<1." },
      { id: "q9", type: "case-study", bloomLevel: 4, marks: 7, topic: "Sets", scenario: "In a survey of 60 students, 35 like Math, 25 like Science, and 10 like both subjects.", prompt: "Find how many students like neither subject, and verify your answer is consistent with the total surveyed.", correctAnswer: "10 students like neither", explanation: "n(Math∪Science)=35+25−10=50. Neither=60−50=10.", improvementTip: "Always verify: (like at least one) + (like neither) = total surveyed." },
      { id: "q10", type: "short-answer", bloomLevel: 4, marks: 10, topic: "Arithmetic Progression", prompt: "The 3rd and 7th terms of an AP are 8 and 20 respectively. Find the first term and common difference.", correctAnswer: "a=2, d=3", explanation: "a₃=a+2d=8, a₇=a+6d=20. Subtracting: 4d=12, d=3. Then a=8−2(3)=2.", improvementTip: "When two terms are given, set up two equations using aₙ=a+(n−1)d and subtract to eliminate a." },
    ],
  }),
  definePaper({
    id: "paper-phy-mock-mech",
    title: "Physics Mock Exam: Mechanics Full Syllabus",
    type: "Mock Exam",
    subject: "Physics",
    topics: ["Motion in a Straight Line", "Newton's Second Law", "Friction", "Work Done by a Force", "Kinetic & Potential Energy"],
    durationMinutes: 90,
    difficulty: "Hard",
    questions: [
      { id: "q1", type: "mcq", bloomLevel: 1, marks: 3, topic: "Motion in a Straight Line", prompt: "Which quantity is a scalar?", options: ["Velocity", "Displacement", "Speed", "Acceleration"], correctAnswer: "Speed", explanation: "Speed has magnitude only; the other three are vectors.", improvementTip: "Vectors need direction; scalars don't." },
      { id: "q2", type: "true-false", bloomLevel: 1, marks: 2, topic: "Newton's Second Law", prompt: "Force is measured in kg·m/s² (Newtons).", correctAnswer: "True", explanation: "1 N = 1 kg·m/s², derived from F=ma.", improvementTip: "Memorize the SI unit derivation of the Newton." },
      { id: "q3", type: "fill-blank", bloomLevel: 1, marks: 2, topic: "Friction", prompt: "The type of friction acting on a rolling ball is called ___ friction.", correctAnswer: "rolling", explanation: "Rolling friction is much smaller than sliding friction.", improvementTip: "Distinguish static, kinetic, and rolling friction clearly." },
      { id: "q4", type: "mcq", bloomLevel: 2, marks: 3, topic: "Work Done by a Force", prompt: "Work done is maximum when the angle between force and displacement is:", options: ["0°", "45°", "90°", "180°"], correctAnswer: "0°", explanation: "W=Fd cos θ is maximum when cos θ=1, i.e. θ=0°.", improvementTip: "Recall W=Fd cos θ and how cosine varies with angle." },
      { id: "q5", type: "fill-blank", bloomLevel: 2, marks: 3, topic: "Kinetic & Potential Energy", prompt: "The formula for kinetic energy is KE = ___", correctAnswer: "1/2 mv^2", explanation: "KE=½mv², where m is mass and v is velocity.", improvementTip: "Memorize KE=½mv² and PE=mgh." },
      { id: "q6", type: "short-answer", bloomLevel: 3, marks: 5, topic: "Motion in a Straight Line", prompt: "A car moving at 20 m/s decelerates uniformly at 4 m/s². Find the time to stop.", correctAnswer: "t = 5 s", explanation: "v=u+at; 0=20−4t; t=5s.", improvementTip: "Use v=u+at and solve for t when final velocity is zero." },
      { id: "q7", type: "short-answer", bloomLevel: 3, marks: 5, topic: "Newton's Second Law", prompt: "A 6 kg object is acted on by a 24 N net force. Find its acceleration.", correctAnswer: "a = 4 m/s²", explanation: "a=F/m=24/6=4 m/s².", improvementTip: "Rearrange F=ma to isolate acceleration." },
      { id: "q8", type: "long-answer", bloomLevel: 3, marks: 8, topic: "Friction", prompt: "A 12 kg crate is pushed with 60 N force on a floor with μₖ=0.4. Find the net force and resulting acceleration (g=10 m/s²).", correctAnswer: "Net force = 12 N, a = 1 m/s²", explanation: "N=mg=120N. Friction=μₖN=48N. Net force=60−48=12N. a=12/12=1 m/s².", improvementTip: "Subtract the friction force from the applied force to get the net force before applying F=ma." },
      { id: "q9", type: "long-answer", bloomLevel: 3, marks: 8, topic: "Kinetic & Potential Energy", prompt: "A 2 kg ball is dropped from a height of 5 m. Find its kinetic energy just before hitting the ground (g=10 m/s²), using energy conservation.", correctAnswer: "KE = 100 J", explanation: "By conservation of energy, all PE converts to KE: PE=mgh=2×10×5=100J=KE at the ground.", improvementTip: "Use conservation of mechanical energy: initial PE = final KE when there's no friction." },
      { id: "q10", type: "case-study", bloomLevel: 4, marks: 9, topic: "Newton's Second Law", scenario: "A 1000 kg elevator is accelerating upward at 2 m/s². The cable must provide enough tension to both support its weight and provide this acceleration (g=10 m/s²).", prompt: "Find the tension in the cable, and explain why it must exceed the elevator's weight.", correctAnswer: "T = 12000 N", explanation: "T − mg = ma → T = m(g+a) = 1000(12) = 12000N. Tension exceeds weight (10000N) since it must also provide the extra upward force for acceleration.", improvementTip: "For upward acceleration, add 'a' to 'g' in T=m(g+a); for downward acceleration, subtract instead." },
      { id: "q11", type: "diagram", bloomLevel: 4, marks: 8, topic: "Friction", diagramCaption: "A block on an incline of angle θ=30°, mass 5 kg, μₛ=0.6, showing force vectors mg sin θ, mg cos θ, normal force N, and friction f.", prompt: "Using the diagram, determine whether the block remains stationary on the 30° incline, showing your reasoning (g=10 m/s²).", correctAnswer: "Yes, it remains stationary since tan 30° (≈0.577) < μₛ (0.6).", explanation: "The block stays still if tan θ ≤ μₛ. Since tan 30°≈0.577 < μₛ=0.6, static friction is enough to prevent sliding.", improvementTip: "Always compare tan θ to μₛ directly — if tan θ ≤ μₛ the block is safely held by friction." },
      { id: "q12", type: "long-answer", bloomLevel: 4, marks: 14, topic: "Motion in a Straight Line", prompt: "A ball is thrown upward with initial velocity 25 m/s from the ground. (a) Find the maximum height reached. (b) Find the total time of flight. (c) Find the velocity when it returns to the ground. (g=10 m/s².) Show all working.", correctAnswer: "(a) 31.25 m  (b) 5 s  (c) 25 m/s downward", explanation: "(a) v²=u²+2as, 0=625−20s → s=31.25m. (b) v=u−gt, 0=25−10t → t=2.5s; total=5s. (c) By symmetry the ball returns at 25 m/s, directed downward.", improvementTip: "For vertical throw problems, use symmetry: time up=time down, and speed at any height is the same going up and coming down." },
    ],
  }),
  definePaper({
    id: "paper-math-prev-pattern",
    title: "Mathematics Previous Pattern Paper: 2025 Board Style",
    type: "Previous Pattern Paper",
    subject: "Mathematics",
    topics: ["Sets", "Trigonometry", "Sequences & Series", "Permutations & Combinations", "Conic Sections"],
    durationMinutes: 120,
    difficulty: "Mixed",
    questions: [
      { id: "q1", type: "mcq", bloomLevel: 1, marks: 4, topic: "Sets", prompt: "Which symbol denotes 'is a subset of'?", options: ["∈", "⊆", "∪", "∩"], correctAnswer: "⊆", explanation: "⊆ denotes the subset relationship between two sets.", improvementTip: "Don't confuse ∈ (element of) with ⊆ (subset of)." },
      { id: "q2", type: "true-false", bloomLevel: 1, marks: 4, topic: "Trigonometry", prompt: "sin θ can be greater than 1 for real θ.", correctAnswer: "False", explanation: "sin θ always lies between −1 and 1 for real angles, since it's a coordinate on the unit circle.", improvementTip: "Remember: sin θ and cos θ are always bounded between −1 and 1." },
      { id: "q3", type: "fill-blank", bloomLevel: 2, marks: 4, topic: "Permutations & Combinations", prompt: "The number of ways to arrange n distinct objects is ___", correctAnswer: "n!", explanation: "n! counts all possible orderings of n distinct objects.", improvementTip: "Permutations of all n objects = n!." },
      { id: "q4", type: "mcq", bloomLevel: 2, marks: 4, topic: "Sequences & Series", prompt: "Which of these is a geometric progression?", options: ["2,4,6,8", "3,6,12,24", "5,10,15,20", "1,3,5,7"], correctAnswer: "3,6,12,24", explanation: "Each term is double the previous one — a constant ratio of 2, defining a GP.", improvementTip: "Check for a constant ratio (GP) vs constant difference (AP)." },
      { id: "q5", type: "short-answer", bloomLevel: 3, marks: 8, topic: "Conic Sections", prompt: "Find the equation of a circle with center (2,3) and radius 5.", correctAnswer: "(x-2)^2 + (y-3)^2 = 25", explanation: "The standard circle equation is (x−h)²+(y−k)²=r²; substituting h=2,k=3,r=5 gives r²=25.", improvementTip: "Memorize (x−h)²+(y−k)²=r² and substitute center and radius directly." },
      { id: "q6", type: "short-answer", bloomLevel: 3, marks: 8, topic: "Permutations & Combinations", prompt: "In how many ways can 3 students be selected from a group of 8 for a competition (order doesn't matter)?", correctAnswer: "56", explanation: "This is a combination: C(8,3) = 8!/(3!5!) = 56.", improvementTip: "Use combinations (nCr) when order doesn't matter, permutations (nPr) when it does." },
      { id: "q7", type: "long-answer", bloomLevel: 3, marks: 12, topic: "Trigonometry", prompt: "Prove that (1 − cos²θ)/sin θ = sin θ, and verify it for θ=30°.", correctAnswer: "Identity holds: LHS simplifies to sin θ using sin²θ+cos²θ=1; at θ=30°, both sides equal 1/2.", explanation: "1−cos²θ = sin²θ, so (1−cos²θ)/sinθ = sin²θ/sinθ = sinθ. At θ=30°, sin30°=1/2, matching both sides.", improvementTip: "Always try substituting the Pythagorean identity (sin²θ+cos²θ=1) first when simplifying trig expressions." },
      { id: "q8", type: "mcq", bloomLevel: 4, marks: 8, topic: "Sets", prompt: "In a group of 50 people, 28 like tea, 30 like coffee, and 8 like neither. How many like both?", options: ["16", "14", "20", "10"], correctAnswer: "16", explanation: "At least one = 50−8=42. n(A∪B)=n(A)+n(B)−n(A∩B): 42=28+30−n(A∩B) → n(A∩B)=16.", improvementTip: "First find 'at least one' by subtracting 'neither' from the total, then apply the union formula." },
      { id: "q9", type: "case-study", bloomLevel: 4, marks: 14, topic: "Conic Sections", scenario: "A satellite dish's cross-section follows a parabolic curve given by y² = 8x, where x and y are measured in meters from the vertex.", prompt: "Identify the focus of this parabola and explain why parabolic dishes are used to focus signals at a single point.", correctAnswer: "Focus at (2,0). Parabolic dishes reflect all incoming parallel rays to converge at the focus.", explanation: "Comparing y²=8x to y²=4ax gives 4a=8, a=2, so the focus is at (2,0). The reflective property of parabolas — all rays parallel to the axis converge at the focus — is why satellite dishes use this shape.", improvementTip: "Compare given parabola equations to the standard form y²=4ax to quickly extract the focus at (a,0)." },
      { id: "q10", type: "diagram", bloomLevel: 4, marks: 14, topic: "Trigonometry", diagramCaption: "A right triangle with the angle of elevation to the top of a lighthouse marked at 60°, and horizontal distance from the base of 30 m.", prompt: "Find the height of the lighthouse using tan 60°=√3, and discuss how the angle of elevation would change if the observer moved closer.", correctAnswer: "Height = 30√3 ≈ 51.96 m; moving closer increases the angle of elevation.", explanation: "height = distance × tan(60°) = 30×√3 ≈ 51.96 m. As distance decreases while height stays fixed, tan θ = height/distance increases, so θ increases.", improvementTip: "Use tan θ = height/distance, and reason about how tan θ changes as either variable changes." },
    ],
  }),
  definePaper({
    id: "paper-chem-ch-redox",
    title: "Chemistry Chapter Test: Redox Reactions",
    type: "Chapter Test",
    subject: "Chemistry",
    topics: ["Oxidation Numbers", "Balancing Redox Equations"],
    durationMinutes: 30,
    difficulty: "Easy",
    questions: [
      { id: "q1", type: "mcq", bloomLevel: 1, marks: 3, topic: "Oxidation Numbers", prompt: "The oxidation number of oxygen in most compounds is:", options: ["+1", "-2", "+2", "-1"], correctAnswer: "-2", explanation: "Oxygen almost always has an oxidation number of −2 in compounds, except in peroxides (−1) and with fluorine.", improvementTip: "Memorize the common oxidation number exceptions for oxygen and hydrogen." },
      { id: "q2", type: "true-false", bloomLevel: 1, marks: 2, topic: "Oxidation Numbers", prompt: "The oxidation number of an element in its free (uncombined) state is always zero.", correctAnswer: "True", explanation: "Elements in their elemental form (e.g. O2, Na, Fe) have an oxidation number of 0.", improvementTip: "Free elements always have oxidation number 0." },
      { id: "q3", type: "fill-blank", bloomLevel: 2, marks: 3, topic: "Oxidation Numbers", prompt: "In H2SO4, the oxidation number of sulfur is ___", correctAnswer: "+6", explanation: "H=+1×2=+2, O=−2×4=−8. For a neutral molecule: +2+S−8=0 → S=+6.", improvementTip: "Set up an equation where the sum of all oxidation numbers equals the molecule's overall charge." },
      { id: "q4", type: "mcq", bloomLevel: 2, marks: 4, topic: "Balancing Redox Equations", prompt: "In a redox reaction, oxidation is defined as:", options: ["Gain of electrons", "Loss of electrons", "Gain of protons", "Loss of protons"], correctAnswer: "Loss of electrons", explanation: "Oxidation involves loss of electrons (OIL RIG: Oxidation Is Loss, Reduction Is Gain).", improvementTip: "Use the mnemonic OIL RIG to remember oxidation vs reduction." },
      { id: "q5", type: "short-answer", bloomLevel: 3, marks: 6, topic: "Balancing Redox Equations", prompt: "Identify the oxidizing and reducing agents in: Zn + CuSO4 → ZnSO4 + Cu.", correctAnswer: "Zn is the reducing agent; CuSO4 (Cu2+) is the oxidizing agent.", explanation: "Zn loses electrons (0→+2), so it is oxidized and is the reducing agent. Cu²⁺ gains electrons (+2→0), so it is reduced and is the oxidizing agent.", improvementTip: "Track oxidation number changes for each element to identify which is oxidized (reducing agent) and which is reduced (oxidizing agent)." },
      { id: "q6", type: "long-answer", bloomLevel: 4, marks: 7, topic: "Balancing Redox Equations", prompt: "Balance the redox equation: Fe2+ + MnO4- → Fe3+ + Mn2+ (acidic medium), showing the half-reaction method.", correctAnswer: "5Fe2+ + MnO4- + 8H+ -> 5Fe3+ + Mn2+ + 4H2O", explanation: "Oxidation half: Fe²⁺→Fe³⁺+e⁻ (×5). Reduction half: MnO4⁻+8H⁺+5e⁻→Mn²⁺+4H2O. Combining and cancelling 5 electrons gives the balanced overall equation.", improvementTip: "Always balance electrons lost in oxidation with electrons gained in reduction before combining half-reactions." },
    ],
  }),
  definePaper({
    id: "paper-bio-wk-cell",
    title: "Biology Weekly Test: Cell Structure & Function",
    type: "Weekly Test",
    subject: "Biology",
    topics: ["Cell Theory", "Biomolecules"],
    durationMinutes: 30,
    difficulty: "Easy",
    questions: [
      { id: "q1", type: "mcq", bloomLevel: 1, marks: 3, topic: "Cell Theory", prompt: "Who is credited with discovering the cell?", options: ["Charles Darwin", "Robert Hooke", "Gregor Mendel", "Louis Pasteur"], correctAnswer: "Robert Hooke", explanation: "Robert Hooke first observed and named 'cells' while examining cork under a microscope in 1665.", improvementTip: "Remember Hooke for discovering cells, Schleiden & Schwann for formalizing Cell Theory." },
      { id: "q2", type: "true-false", bloomLevel: 1, marks: 2, topic: "Cell Theory", prompt: "All living organisms are composed of one or more cells.", correctAnswer: "True", explanation: "This is one of the three core tenets of Cell Theory.", improvementTip: "Review the three tenets of Cell Theory." },
      { id: "q3", type: "fill-blank", bloomLevel: 2, marks: 3, topic: "Biomolecules", prompt: "Proteins are polymers made up of monomer units called ___", correctAnswer: "amino acids", explanation: "Amino acids link together via peptide bonds to form proteins.", improvementTip: "Match each biomolecule to its monomer: proteins→amino acids, carbohydrates→monosaccharides, nucleic acids→nucleotides." },
      { id: "q4", type: "mcq", bloomLevel: 2, marks: 4, topic: "Biomolecules", prompt: "Which biomolecule serves as the primary long-term energy storage in plants?", options: ["Protein", "Starch", "DNA", "Cellulose"], correctAnswer: "Starch", explanation: "Starch is the primary storage polysaccharide in plants, broken down to release glucose for energy.", improvementTip: "Distinguish storage polysaccharides (starch, glycogen) from structural ones (cellulose, chitin)." },
      { id: "q5", type: "short-answer", bloomLevel: 3, marks: 6, topic: "Biomolecules", prompt: "Explain the difference between a saturated and an unsaturated fatty acid.", correctAnswer: "Saturated fatty acids have no C=C double bonds; unsaturated fatty acids have one or more double bonds.", explanation: "The presence of double bonds in unsaturated fats introduces kinks in the carbon chain, which is why unsaturated fats are typically liquid at room temperature, while saturated fats are solid.", improvementTip: "Link the chemical structure (presence/absence of double bonds) to the physical property (liquid vs solid at room temperature)." },
      { id: "q6", type: "long-answer", bloomLevel: 4, marks: 7, topic: "Cell Theory", prompt: "Discuss how the invention of the electron microscope expanded our understanding of cell structure beyond what Robert Hooke could observe.", correctAnswer: "Electron microscopes revealed sub-cellular organelles invisible under Hooke's light microscope.", explanation: "Hooke's 17th-century microscope could only reveal cell wall outlines in cork. Modern electron microscopes offer far greater resolution, revealing organelles and their roles, refining (not overturning) the original Cell Theory.", improvementTip: "When discussing scientific progress, connect improved technology directly to the specific new discoveries it enabled." },
    ],
  }),
  definePaper({
    id: "paper-math-final-term1",
    title: "Mathematics Final Exam: Term 1 Comprehensive",
    type: "Final Exam",
    subject: "Mathematics",
    topics: ["Sets", "Trigonometry", "Sequences & Series", "Permutations & Combinations", "Conic Sections"],
    durationMinutes: 150,
    difficulty: "Hard",
    questions: [
      { id: "q1", type: "mcq", bloomLevel: 1, marks: 5, topic: "Sets", prompt: "Which of these pairs of sets are equal?", options: ["{1,2,3} and {3,2,1}", "{1,2} and {1,2,3}", "{a,b} and {b,c}", "{x} and {y}"], correctAnswer: "{1,2,3} and {3,2,1}", explanation: "Sets are equal if they contain exactly the same elements, regardless of order.", improvementTip: "Order doesn't matter in sets — only which elements are present." },
      { id: "q2", type: "true-false", bloomLevel: 1, marks: 5, topic: "Trigonometry", prompt: "sec θ is undefined when cos θ = 0.", correctAnswer: "True", explanation: "sec θ = 1/cos θ, undefined when cos θ = 0 (e.g. θ = 90°).", improvementTip: "Check the denominator of each reciprocal ratio for zero." },
      { id: "q3", type: "fill-blank", bloomLevel: 1, marks: 5, topic: "Sequences & Series", prompt: "The common ratio of a GP is found by dividing any term by its ___ term.", correctAnswer: "previous", explanation: "r = aₙ/aₙ₋₁, the ratio of a term to the one before it.", improvementTip: "Common ratio r is always (later term)/(earlier term)." },
      { id: "q4", type: "mcq", bloomLevel: 2, marks: 6, topic: "Permutations & Combinations", prompt: "nPr is related to nCr by which formula?", options: ["nPr = nCr × r!", "nPr = nCr / r!", "nPr = nCr + r!", "nPr = r! / nCr"], correctAnswer: "nPr = nCr × r!", explanation: "nPr counts ordered selections, nCr counts unordered ones; multiplying nCr by r! gives nPr.", improvementTip: "Remember: permutations = combinations × arrangements of the chosen items." },
      { id: "q5", type: "fill-blank", bloomLevel: 2, marks: 6, topic: "Conic Sections", prompt: "The standard equation of an ellipse with semi-major axis a and semi-minor axis b centered at the origin is ___", correctAnswer: "x^2/a^2 + y^2/b^2 = 1", explanation: "This is the standard form of an ellipse centered at the origin with axes along the coordinate axes.", improvementTip: "Memorize the standard forms for circle, parabola, ellipse, and hyperbola separately." },
      { id: "q6", type: "short-answer", bloomLevel: 3, marks: 8, topic: "Sets", prompt: "If A={1,2,3,4}, B={3,4,5,6}, find A−B and B−A.", correctAnswer: "A-B={1,2}, B-A={5,6}", explanation: "A−B keeps elements only in A, not B. B−A keeps elements only in B, not A.", improvementTip: "Set difference is NOT symmetric — A−B and B−A are usually different." },
      { id: "q7", type: "short-answer", bloomLevel: 3, marks: 8, topic: "Trigonometry", prompt: "Prove that sin(90°−θ) = cos θ using the complementary angle relationship.", correctAnswer: "Follows from co-function identities in a right triangle.", explanation: "In a right triangle, the two acute angles are complementary. The side 'opposite' one angle is 'adjacent' to the other, which is why sine of one angle equals cosine of its complement.", improvementTip: "Draw a right triangle and swap perspective between the two acute angles to see why co-function identities hold." },
      { id: "q8", type: "long-answer", bloomLevel: 3, marks: 10, topic: "Sequences & Series", prompt: "The 4th term of a GP is 24 and the 7th term is 192. Find the first term and common ratio.", correctAnswer: "a=3, r=2", explanation: "a₄=ar³=24, a₇=ar⁶=192. Dividing: r³=8, r=2. Then a=24/8=3.", improvementTip: "When given two terms of a GP, divide the equations to eliminate 'a' and solve for r first." },
      { id: "q9", type: "mcq", bloomLevel: 4, marks: 12, topic: "Permutations & Combinations", prompt: "In how many ways can a committee of 4 be selected from 6 men and 5 women such that it includes exactly 2 men and 2 women?", options: ["150", "300", "75", "225"], correctAnswer: "150", explanation: "Ways to choose 2 men from 6: C(6,2)=15. Ways to choose 2 women from 5: C(5,2)=10. Total = 15×10 = 150.", improvementTip: "Break combined selection problems into separate combinations for each group, then multiply the results." },
      { id: "q10", type: "case-study", bloomLevel: 4, marks: 12, topic: "Conic Sections", scenario: "An elliptical park has a semi-major axis of 50 m and semi-minor axis of 30 m, centered at the origin, with its major axis along the x-axis.", prompt: "Write the equation of the boundary of the park and find the distance between its two foci (using c²=a²−b²).", correctAnswer: "x^2/2500 + y^2/900 = 1; foci distance = 80 m", explanation: "a=50,b=30 gives x²/2500+y²/900=1. c²=a²−b²=2500−900=1600, so c=40, and the distance between the two foci is 2c=80 m.", improvementTip: "Always compute c²=a²−b² for an ellipse (not the Pythagorean sum) before finding the foci." },
      { id: "q11", type: "diagram", bloomLevel: 4, marks: 12, topic: "Sequences & Series", diagramCaption: "A bar chart showing 5 rows of a stadium, with seat counts 20, 24, 28, 32, 36 increasing by a constant amount each row.", prompt: "Identify the type of sequence shown and calculate the total number of seats in the first 20 rows if this pattern continues.", correctAnswer: "AP with a=20, d=4; S20 = 1160 seats", explanation: "The seat counts increase by a constant 4 each row, confirming an AP with a=20, d=4. Sₙ=n/2[2a+(n−1)d] with n=20 gives 1160 total seats.", improvementTip: "Whenever a real-world quantity increases by a constant amount, model it as an AP and apply the sum formula directly." },
      { id: "q12", type: "long-answer", bloomLevel: 4, marks: 11, topic: "Trigonometry", prompt: "A ladder 10 m long leans against a wall, making an angle of 60° with the ground. Find the height it reaches on the wall and the distance of its foot from the wall, and discuss what happens to these values if the angle is reduced to 30°.", correctAnswer: "At 60°: height≈8.66m, base=5m. At 30°: height=5m, base≈8.66m.", explanation: "height=L sinθ and base=L cosθ. Reducing θ decreases sinθ (lower height) and increases cosθ (foot further from wall).", improvementTip: "Model the ladder-wall-ground setup as a right triangle with the ladder as hypotenuse — height=L sinθ, base=L cosθ." },
    ],
  }),
];

export function getPaperById(id: string) {
  return papers.find((p) => p.id === id);
}

// ---------------------------------------------------------------------------
// Mock grading engine
// ---------------------------------------------------------------------------

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/[{}()\s]/g, "");
}

function keywordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s.]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
}

export function mockGradeAnswer(q: PaperQuestion, studentAnswer: string): { isCorrect: boolean; marksAwarded: number } {
  const trimmed = (studentAnswer ?? "").trim();
  if (!trimmed) return { isCorrect: false, marksAwarded: 0 };

  if (q.type === "mcq" || q.type === "true-false") {
    const correct = normalize(studentAnswer) === normalize(q.correctAnswer);
    return { isCorrect: correct, marksAwarded: correct ? q.marks : 0 };
  }

  if (q.type === "fill-blank") {
    const a = normalize(studentAnswer);
    const c = normalize(q.correctAnswer);
    const correct = a === c || a.includes(c) || c.includes(a);
    return { isCorrect: correct, marksAwarded: correct ? q.marks : 0 };
  }

  // Open-ended: short-answer, long-answer, case-study, diagram
  const targetWords = keywordSet(`${q.correctAnswer} ${q.explanation}`);
  const answerWords = keywordSet(studentAnswer);
  let hits = 0;
  targetWords.forEach((w) => {
    if (answerWords.has(w)) hits++;
  });
  const ratio = targetWords.size ? hits / targetWords.size : 0;

  if (ratio >= 0.3) return { isCorrect: true, marksAwarded: q.marks };
  if (ratio > 0 || trimmed.length > 30) return { isCorrect: false, marksAwarded: Math.round(q.marks * 0.5) };
  return { isCorrect: false, marksAwarded: 0 };
}

export function generateAttemptResult(paper: Paper, answers: Record<string, string>, timeTakenSeconds: number): AttemptResult {
  const perQuestion: AttemptQuestionResult[] = paper.questions.map((q) => {
    const studentAnswer = answers[q.id] ?? "";
    const { isCorrect, marksAwarded } = mockGradeAnswer(q, studentAnswer);
    return {
      questionId: q.id,
      topic: q.topic,
      bloomLevel: q.bloomLevel,
      type: q.type,
      prompt: q.prompt,
      studentAnswer: studentAnswer.trim() || "(Not answered)",
      correctAnswer: q.correctAnswer,
      isCorrect,
      marksAwarded,
      marks: q.marks,
      explanation: q.explanation,
      improvementTip: q.improvementTip,
    };
  });

  const scoreObtained = perQuestion.reduce((s, q) => s + q.marksAwarded, 0);
  const totalMarks = paper.totalMarks;
  const accuracy = totalMarks ? Math.round((scoreObtained / totalMarks) * 100) : 0;

  const higherOrder = perQuestion.filter((q) => q.bloomLevel >= 3);
  const higherOrderTotal = higherOrder.reduce((s, q) => s + q.marks, 0);
  const conceptUnderstanding = higherOrderTotal
    ? Math.round((higherOrder.reduce((s, q) => s + q.marksAwarded, 0) / higherOrderTotal) * 100)
    : accuracy;

  const topicMap = new Map<string, { scored: number; total: number }>();
  perQuestion.forEach((q) => {
    const cur = topicMap.get(q.topic) ?? { scored: 0, total: 0 };
    cur.scored += q.marksAwarded;
    cur.total += q.marks;
    topicMap.set(q.topic, cur);
  });
  const topicBreakdown = Array.from(topicMap.entries()).map(([topic, v]) => ({ topic, ...v }));

  const bloomLabels: Record<number, string> = { 1: "Remember", 2: "Understand", 3: "Apply", 4: "Analyze" };
  const bloomMap = new Map<number, { scored: number; total: number }>();
  perQuestion.forEach((q) => {
    const cur = bloomMap.get(q.bloomLevel) ?? { scored: 0, total: 0 };
    cur.scored += q.marksAwarded;
    cur.total += q.marks;
    bloomMap.set(q.bloomLevel, cur);
  });
  const bloomBreakdown = [1, 2, 3, 4]
    .filter((l) => bloomMap.has(l))
    .map((l) => ({ level: l, label: bloomLabels[l], ...bloomMap.get(l)! }));

  const weakConcepts = Array.from(
    new Set(topicBreakdown.filter((t) => t.total > 0 && t.scored / t.total < 0.5).map((t) => t.topic))
  ).slice(0, 5);

  const missingKnowledge = Array.from(
    new Set(perQuestion.filter((q) => q.marksAwarded === 0).map((q) => `${q.topic}: ${q.improvementTip}`))
  ).slice(0, 5);

  const commonErrorsSet = new Set<string>();
  perQuestion
    .filter((q) => !q.isCorrect)
    .forEach((q) => {
      if (q.type === "mcq" || q.type === "true-false") commonErrorsSet.add(`Conceptual mix-up in ${q.topic}`);
      else if (q.type === "fill-blank") commonErrorsSet.add(`Recall/definition gap in ${q.topic}`);
      else commonErrorsSet.add(`Incomplete or imprecise reasoning in ${q.topic}`);
    });

  return {
    paperId: paper.id,
    paperTitle: paper.title,
    scoreObtained,
    totalMarks,
    accuracy,
    conceptUnderstanding,
    timeTakenMinutes: Math.max(1, Math.round(timeTakenSeconds / 60)),
    weakConcepts,
    missingKnowledge: missingKnowledge.length ? missingKnowledge : ["No major knowledge gaps detected — keep practicing to maintain mastery."],
    commonErrors: commonErrorsSet.size ? Array.from(commonErrorsSet).slice(0, 5) : ["No recurring error patterns detected in this attempt."],
    topicBreakdown,
    bloomBreakdown,
    perQuestion,
  };
}
