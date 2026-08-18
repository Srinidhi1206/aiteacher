import { TopicContent } from "@/lib/types";
import { getChapterAndTopic } from "@/lib/mock-data/subjects";

// Fully authored, genuine educational content for a set of flagship topics
// (Mathematics: Sets, Trigonometric Ratios, Arithmetic Progression;
//  Physics: Motion in a Straight Line, Newton's Second Law, Friction).
// Every other topic falls back to `genericContent`, which is still
// name-aware and grounded in the topic/chapter/subject rather than lorem ipsum.
const authoredContent: Record<string, TopicContent> = {
  "math-t1": {
    objectives: [
      "Define a set and identify well-defined collections of objects.",
      "Represent sets using roster form and set-builder form.",
      "Classify sets as finite, infinite, empty, singleton, equal, and equivalent.",
      "Perform operations on sets: union, intersection, difference, and complement.",
      "Apply Venn diagrams to visualize relationships between sets.",
    ],
    theory: [
      "A set is a well-defined collection of distinct objects, called elements or members of the set. \"Well-defined\" means that given any object, we can decide with certainty whether it belongs to the set or not. Sets are usually denoted by capital letters (A, B, C) and elements by lowercase letters. For example, the set of vowels in the English alphabet is V = {a, e, i, o, u}.",
      "Sets can be written in two ways. In roster (or tabular) form, all elements are listed within curly braces, such as A = {1, 2, 3, 4, 5}. In set-builder form, the set is described by a property that its elements satisfy, such as A = {x : x is a natural number and x ≤ 5}. Set-builder form is especially useful for infinite sets, like the set of all even integers, {x : x = 2n, n ∈ ℤ}.",
      "Important types of sets include the empty set (∅) which has no elements, singleton sets with exactly one element, finite and infinite sets based on whether elements can be counted, and the universal set (U), which contains all objects under consideration. Two sets are equal if they contain exactly the same elements, and equivalent if they have the same number of elements (cardinality) even if the elements differ.",
      "Sets combine through operations. The union (A ∪ B) collects all elements in A or B or both. The intersection (A ∩ B) collects only elements common to both. The difference (A − B) contains elements in A but not in B. The complement (A′) contains all elements of the universal set that are not in A. Venn diagrams give a powerful visual tool for reasoning about these operations and verifying laws such as De Morgan's laws.",
    ],
    illustrations: [
      { title: "Venn Diagram: Union and Intersection", caption: "Two overlapping circles A and B inside rectangle U; shading both circles shows the union, shading only the overlap shows the intersection.", kind: "diagram" },
      { title: "Subset Relationship", caption: "A smaller circle B fully inside circle A illustrates B ⊆ A.", kind: "diagram" },
      { title: "Types of Sets Flowchart", caption: "A branching chart classifying sets into finite, infinite, empty, singleton, and equal/equivalent sets.", kind: "chart" },
    ],
    examples: [
      {
        title: "Union and Intersection",
        problem: "If A = {2, 4, 6, 8, 10} and B = {4, 8, 12, 16}, find A ∪ B and A ∩ B.",
        steps: [
          "List all elements that appear in A or B without repeating common elements for the union.",
          "A ∪ B = {2, 4, 6, 8, 10, 12, 16}.",
          "For the intersection, list only elements common to both sets: 4 and 8 appear in both A and B.",
          "A ∩ B = {4, 8}.",
        ],
        answer: "A ∪ B = {2, 4, 6, 8, 10, 12, 16},  A ∩ B = {4, 8}",
      },
      {
        title: "Set-Builder to Roster Form",
        problem: "Write the set A = {x : x is an integer and −3 ≤ x < 3} in roster form.",
        steps: [
          "Identify the range of integers satisfying −3 ≤ x < 3.",
          "Since x must be ≥ −3 and strictly < 3, list −3, −2, −1, 0, 1, 2.",
          "Write the final roster form.",
        ],
        answer: "A = {−3, −2, −1, 0, 1, 2}",
      },
      {
        title: "Complement using De Morgan's Law",
        problem: "If U = {1,...,10}, A = {1,2,3,4}, B = {3,4,5,6}, verify (A ∪ B)′ = A′ ∩ B′.",
        steps: [
          "Find A ∪ B = {1,2,3,4,5,6}, so (A ∪ B)′ = {7,8,9,10}.",
          "Find A′ = {5,6,7,8,9,10} and B′ = {1,2,7,8,9,10}.",
          "Find A′ ∩ B′ = {7,8,9,10}.",
          "Both results match, verifying De Morgan's law.",
        ],
        answer: "(A ∪ B)′ = A′ ∩ B′ = {7,8,9,10}",
      },
    ],
    applications: [
      { title: "Database Queries", description: "SQL operations like JOIN, UNION, and INTERSECT used in databases are direct applications of set union, intersection, and difference on tables of records." },
      { title: "Search Engines & Boolean Logic", description: "Search engines combine keyword results using set operations — an 'AND' search is an intersection of result sets, while 'OR' is a union." },
      { title: "Probability Theory", description: "Set theory is the foundation of probability: sample spaces and events are sets, and rules like P(A ∪ B) = P(A) + P(B) − P(A ∩ B) come directly from set operations." },
    ],
    formulae: [
      { name: "Union of Two Sets", expression: "n(A ∪ B) = n(A) + n(B) − n(A ∩ B)", description: "Number of elements in the union of two finite sets." },
      { name: "De Morgan's Law 1", expression: "(A ∪ B)′ = A′ ∩ B′", description: "Complement of a union equals the intersection of complements." },
      { name: "De Morgan's Law 2", expression: "(A ∩ B)′ = A′ ∪ B′", description: "Complement of an intersection equals the union of complements." },
      { name: "Three-Set Union", expression: "n(A∪B∪C) = n(A)+n(B)+n(C)−n(A∩B)−n(B∩C)−n(A∩C)+n(A∩B∩C)", description: "Inclusion–exclusion formula for three sets." },
    ],
    summary: [
      "A set is a well-defined collection of distinct objects; can be written in roster or set-builder form.",
      "Special sets: empty, singleton, finite, infinite, equal, and equivalent sets.",
      "Union combines elements from both sets; intersection keeps only common elements.",
      "Difference and complement isolate elements unique to one set or outside a set.",
      "Venn diagrams and De Morgan's laws help visualize and simplify set operations.",
    ],
    flashcards: [
      { id: "fc-set-1", front: "What is a set?", back: "A well-defined collection of distinct objects or elements." },
      { id: "fc-set-2", front: "What is the empty set?", back: "A set with no elements, denoted ∅." },
      { id: "fc-set-3", front: "Formula for n(A ∪ B)?", back: "n(A) + n(B) − n(A ∩ B)" },
      { id: "fc-set-4", front: "What does A′ mean?", back: "The complement of A — all elements of U that are not in A." },
      { id: "fc-set-5", front: "De Morgan's first law?", back: "(A ∪ B)′ = A′ ∩ B′" },
      { id: "fc-set-6", front: "Equal vs equivalent sets?", back: "Equal sets have identical elements; equivalent sets just have the same cardinality (count)." },
    ],
    revisionNotes: [
      "Roster form lists elements; set-builder form states a defining property.",
      "∅ ⊆ A for every set A (empty set is a subset of every set).",
      "A ⊆ B means every element of A is also in B.",
      "Union = 'or', Intersection = 'and', Difference = 'only in A, not B'.",
      "Always draw a Venn diagram first when a set problem feels confusing.",
    ],
  },
  "math-t5": {
    objectives: [
      "Define the six trigonometric ratios for a right triangle.",
      "Recall exact trigonometric ratio values for standard angles (0°, 30°, 45°, 60°, 90°).",
      "Use the Pythagorean identities to relate different trigonometric ratios.",
      "Determine the sign of trigonometric ratios in each quadrant.",
      "Apply trigonometric ratios to solve problems involving heights and distances.",
    ],
    theory: [
      "In a right-angled triangle, the trigonometric ratios relate an acute angle θ to ratios of the triangle's sides: sin θ = opposite/hypotenuse, cos θ = adjacent/hypotenuse, and tan θ = opposite/adjacent. The reciprocal ratios are cosec θ = 1/sin θ, sec θ = 1/cos θ, and cot θ = 1/tan θ.",
      "To extend these ratios beyond right triangles, trigonometry is redefined using the unit circle — a circle of radius 1 centered at the origin. For any angle θ measured from the positive x-axis, cos θ is the x-coordinate and sin θ is the y-coordinate of the point where the terminal side meets the circle, making the ratios work for any angle, including obtuse and negative angles.",
      "The sign of each ratio depends on the quadrant, remembered by the mnemonic ASTC ('All Silver Tea Cups'): in Quadrant I all ratios are positive, in Quadrant II only Sine (and cosec) is positive, in Quadrant III only Tangent (and cot) is positive, and in Quadrant IV only Cosine (and sec) is positive.",
      "Certain angles — 0°, 30°, 45°, 60°, and 90° — have exact, memorable trigonometric values used constantly in problems, derived from the equilateral triangle (30°/60°) and the isosceles right triangle (45°). The identity sin²θ + cos²θ = 1 comes directly from the Pythagorean theorem, along with 1 + tan²θ = sec²θ and 1 + cot²θ = cosec²θ.",
    ],
    illustrations: [
      { title: "Right Triangle Ratio Diagram", caption: "A right triangle with angle θ labeled, showing opposite, adjacent, and hypotenuse sides used to define sin, cos, and tan.", kind: "diagram" },
      { title: "Unit Circle", caption: "A circle of radius 1 with angle θ from the positive x-axis; the point on the circle has coordinates (cos θ, sin θ).", kind: "diagram" },
      { title: "ASTC Quadrant Sign Chart", caption: "A four-quadrant grid showing which trigonometric ratios are positive in each quadrant.", kind: "chart" },
    ],
    examples: [
      {
        title: "Finding Ratios from a Right Triangle",
        problem: "In a right triangle, the side opposite angle θ is 3 cm and the adjacent side is 4 cm. Find sin θ, cos θ, and tan θ.",
        steps: [
          "Find the hypotenuse using the Pythagorean theorem: √(3² + 4²) = √25 = 5 cm.",
          "sin θ = opposite/hypotenuse = 3/5.",
          "cos θ = adjacent/hypotenuse = 4/5.",
          "tan θ = opposite/adjacent = 3/4.",
        ],
        answer: "sin θ = 3/5, cos θ = 4/5, tan θ = 3/4",
      },
      {
        title: "Standard Angle Evaluation",
        problem: "Evaluate sin 30° · cos 60° + cos 30° · sin 60°.",
        steps: [
          "Recall standard values: sin 30° = 1/2, cos 60° = 1/2, cos 30° = √3/2, sin 60° = √3/2.",
          "Substitute: (1/2)(1/2) + (√3/2)(√3/2).",
          "Compute: 1/4 + 3/4 = 1.",
        ],
        answer: "1",
      },
      {
        title: "Using the Pythagorean Identity",
        problem: "If sin θ = 5/13 and θ is acute, find cos θ and tan θ.",
        steps: [
          "Apply sin²θ + cos²θ = 1: (5/13)² + cos²θ = 1.",
          "cos²θ = 1 − 25/169 = 144/169.",
          "cos θ = 12/13 (positive since θ is acute).",
          "tan θ = sin θ/cos θ = (5/13)/(12/13) = 5/12.",
        ],
        answer: "cos θ = 12/13, tan θ = 5/12",
      },
    ],
    applications: [
      { title: "Heights and Distances", description: "Surveyors and architects use angles of elevation and depression with trigonometric ratios to calculate the height of buildings and towers without direct measurement." },
      { title: "Navigation and GPS", description: "Ships and aircraft use trigonometric ratios to calculate bearings, distances, and positions relative to known landmarks." },
      { title: "Engineering and Construction", description: "Trigonometric ratios determine the correct slope of ramps, roof pitches, and forces along inclined beams." },
    ],
    formulae: [
      { name: "Basic Ratios", expression: "sin θ = opp/hyp,  cos θ = adj/hyp,  tan θ = opp/adj", description: "Definitions of sine, cosine, and tangent in a right triangle." },
      { name: "Pythagorean Identity", expression: "sin²θ + cos²θ = 1", description: "The fundamental identity relating sine and cosine." },
      { name: "Tangent Identity", expression: "1 + tan²θ = sec²θ", description: "Derived by dividing the Pythagorean identity by cos²θ." },
      { name: "Cotangent Identity", expression: "1 + cot²θ = cosec²θ", description: "Derived by dividing the Pythagorean identity by sin²θ." },
    ],
    summary: [
      "Six trigonometric ratios describe relationships between angles and side lengths of a right triangle.",
      "The unit circle extends these ratios to all angles, not just those in a right triangle.",
      "The ASTC rule tells you the sign of each ratio in every quadrant.",
      "Standard angle values (0°, 30°, 45°, 60°, 90°) must be memorized.",
      "sin²θ + cos²θ = 1 is the master identity behind most trigonometric simplification.",
    ],
    flashcards: [
      { id: "fc-trig-1", front: "sin θ = ?", back: "Opposite / Hypotenuse" },
      { id: "fc-trig-2", front: "What does ASTC stand for?", back: "All, Sine, Tangent, Cosine — positive ratios in Quadrants I, II, III, IV." },
      { id: "fc-trig-3", front: "sin 45° = ?", back: "1/√2" },
      { id: "fc-trig-4", front: "cos²θ + sin²θ = ?", back: "1" },
      { id: "fc-trig-5", front: "tan θ in terms of sin and cos?", back: "tan θ = sin θ / cos θ" },
      { id: "fc-trig-6", front: "sec θ = ?", back: "1 / cos θ" },
    ],
    revisionNotes: [
      "Memorize the 0°–30°–45°–60°–90° table for sin, cos, tan.",
      "SOH-CAH-TOA: Sin=Opp/Hyp, Cos=Adj/Hyp, Tan=Opp/Adj.",
      "Sign of ratio depends on quadrant — use ASTC.",
      "Reciprocal pairs: sin↔cosec, cos↔sec, tan↔cot.",
      "Always sketch the triangle or unit circle when unsure of a sign.",
    ],
  },
  "math-t9": {
    objectives: [
      "Identify whether a given sequence is an arithmetic progression (AP).",
      "Find the common difference, nth term, and number of terms of an AP.",
      "Derive and apply the formula for the sum of the first n terms of an AP.",
      "Insert arithmetic means between two given numbers.",
      "Solve real-world problems modeled using arithmetic progressions.",
    ],
    theory: [
      "A sequence of numbers is an arithmetic progression (AP) if the difference between any two consecutive terms is always the same constant, called the common difference (d). If the first term is a, the AP looks like a, a+d, a+2d, ... For example, 3, 7, 11, 15, 19 is an AP with a = 3 and d = 4.",
      "The nth term of an AP is given by aₙ = a + (n−1)d. This lets us jump directly to any term without listing every term before it — for instance, the 20th term of 3, 7, 11, 15,... is a₂₀ = 3 + 19(4) = 79.",
      "The sum of the first n terms, Sₙ, can be derived by pairing the first and last terms, the second and second-last, and so on — each pair sums to the same value (a + l). This gives Sₙ = n/2[2a + (n−1)d], also written as Sₙ = n/2(a + l) when the last term l is known.",
      "Arithmetic means are terms inserted between two numbers so the whole sequence becomes an AP. If a single mean A is inserted between a and b, A = (a+b)/2. This generalizes to inserting multiple means by treating the whole set as one AP and solving for d.",
    ],
    illustrations: [
      { title: "AP on a Number Line", caption: "Points plotted at equal spacing on a number line, illustrating a constant common difference d between consecutive terms.", kind: "diagram" },
      { title: "Sum by Pairing Method", caption: "First and last terms connected by an arc, second and second-last connected, showing each pair sums to the same total (a + l).", kind: "diagram" },
      { title: "AP vs Term Number Graph", caption: "A straight-line graph of term value against term number n, showing an AP always produces a linear graph with slope d.", kind: "graph" },
    ],
    examples: [
      {
        title: "Finding the nth Term",
        problem: "Find the 15th term of the AP 5, 9, 13, 17, ...",
        steps: [
          "Identify a = 5 and d = 9 − 5 = 4.",
          "Use the formula aₙ = a + (n−1)d.",
          "Substitute n = 15: a₁₅ = 5 + 14(4) = 5 + 56.",
        ],
        answer: "a₁₅ = 61",
      },
      {
        title: "Sum of an AP",
        problem: "Find the sum of the first 20 terms of the AP 2, 5, 8, 11, ...",
        steps: [
          "Identify a = 2 and d = 3.",
          "Use Sₙ = n/2[2a + (n−1)d] with n = 20.",
          "Substitute: S₂₀ = 10[2(2) + 19(3)] = 10[4 + 57] = 10 × 61.",
        ],
        answer: "S₂₀ = 610",
      },
      {
        title: "Inserting Arithmetic Means",
        problem: "Insert 3 arithmetic means between 4 and 20.",
        steps: [
          "The sequence becomes 4, A₁, A₂, A₃, 20 — 5 terms total, so n = 5.",
          "Use aₙ = a + (n−1)d: 20 = 4 + 4d, so d = 4.",
          "The means are A₁ = 8, A₂ = 12, A₃ = 16.",
        ],
        answer: "The three arithmetic means are 8, 12, and 16",
      },
    ],
    applications: [
      { title: "Loan and Savings Schedules", description: "Simple-interest repayments and fixed-increment savings plans form arithmetic progressions, letting banks calculate total payments using the AP sum formula." },
      { title: "Stadium and Theatre Seating", description: "Rows of seats that increase by a fixed number each row form an AP, used to calculate total seating capacity." },
      { title: "Construction and Stacking Patterns", description: "Bricks or pipes stacked so each layer has a constant number more or fewer than the last form an AP, useful for estimating material quantities." },
    ],
    formulae: [
      { name: "nth Term", expression: "aₙ = a + (n − 1)d", description: "The nth term of an AP with first term a and common difference d." },
      { name: "Sum of n Terms", expression: "Sₙ = n/2 [2a + (n − 1)d]", description: "Sum of the first n terms using the first term and common difference." },
      { name: "Sum (last-term form)", expression: "Sₙ = n/2 (a + l)", description: "Sum of the first n terms when the last term l is known." },
      { name: "Arithmetic Mean", expression: "A = (a + b) / 2", description: "The single arithmetic mean inserted between two numbers a and b." },
    ],
    summary: [
      "An AP has a constant common difference d between consecutive terms.",
      "The nth term formula aₙ = a + (n−1)d lets you find any term directly.",
      "The sum formula Sₙ = n/2[2a+(n−1)d] avoids adding all terms one by one.",
      "Arithmetic means divide the gap between two numbers into equal steps.",
      "Many real-world sequences (payments, seating, stacking) are naturally APs.",
    ],
    flashcards: [
      { id: "fc-ap-1", front: "What defines an AP?", back: "A sequence where the difference between consecutive terms is constant (d)." },
      { id: "fc-ap-2", front: "nth term formula?", back: "aₙ = a + (n−1)d" },
      { id: "fc-ap-3", front: "Sum of n terms formula?", back: "Sₙ = n/2 [2a + (n−1)d]" },
      { id: "fc-ap-4", front: "Arithmetic mean of a and b?", back: "(a + b)/2" },
      { id: "fc-ap-5", front: "If d is negative, what happens to the AP?", back: "The terms decrease — it's a decreasing AP." },
      { id: "fc-ap-6", front: "How to find d from two consecutive terms?", back: "d = aₙ − aₙ₋₁" },
    ],
    revisionNotes: [
      "Common difference d = a₂ − a₁ = a₃ − a₂ = constant.",
      "Always check whether the problem gives 'a' or some other term.",
      "l = a + (n−1)d gives the last term, useful before Sₙ = n/2(a+l).",
      "For 'insert k means' problems, treat the sequence as (k+2) total terms.",
      "A negative common difference just means a decreasing sequence.",
    ],
  },
  "phy-t5": {
    objectives: [
      "Differentiate between distance/displacement and speed/velocity.",
      "Interpret position-time and velocity-time graphs for uniformly accelerated motion.",
      "Apply the three equations of motion to solve numerical problems.",
      "Distinguish between uniform and non-uniform (accelerated) motion.",
      "Analyze motion under gravity as a special case of uniformly accelerated motion.",
    ],
    theory: [
      "Motion in a straight line (rectilinear motion) is the simplest form of motion, where an object moves along a single path. Distance is the total path length covered, a scalar always ≥0, while displacement is the shortest straight-line change in position, a vector that can be positive, negative, or zero. Speed (distance/time) is a scalar; velocity (displacement/time) is a vector.",
      "When velocity changes with time, the object accelerates: a = Δv/Δt. If acceleration is constant, the motion is uniformly accelerated and can be fully described by three equations of motion connecting initial velocity (u), final velocity (v), acceleration (a), time (t), and displacement (s).",
      "Position-time graphs plot position against time — the slope at any point gives instantaneous velocity. A straight line means uniform velocity; a curve means changing velocity. Velocity-time graphs plot velocity against time — the slope gives acceleration, and the area under the curve gives displacement.",
      "Motion under gravity — an object falling or thrown vertically — is a common case of uniformly accelerated motion, with a = g ≈ 9.8 m/s², directed downward. The same three equations apply, using +g for falling objects and −g for objects thrown upward.",
    ],
    illustrations: [
      { title: "Position-Time Graph (Uniform Velocity)", caption: "A straight sloped line on a position vs time graph; the constant slope represents constant velocity.", kind: "graph" },
      { title: "Velocity-Time Graph (Uniform Acceleration)", caption: "A straight sloped line on a velocity vs time graph; the area under the line (a trapezium) equals displacement.", kind: "graph" },
      { title: "Distance vs Displacement Path", caption: "A curved, winding path between two points labeled 'distance', with a straight dashed arrow between the same points labeled 'displacement'.", kind: "diagram" },
    ],
    examples: [
      {
        title: "Using v = u + at",
        problem: "A car starts from rest and accelerates uniformly at 2 m/s² for 10 seconds. Find its final velocity.",
        steps: [
          "Identify known values: u = 0 m/s, a = 2 m/s², t = 10 s.",
          "Use v = u + at.",
          "Substitute: v = 0 + (2)(10).",
        ],
        answer: "v = 20 m/s",
      },
      {
        title: "Using s = ut + ½at²",
        problem: "A ball is thrown upward at 15 m/s. Find its displacement after 2 seconds (g = 10 m/s²).",
        steps: [
          "Since the ball moves upward, take a = −g = −10 m/s², u = 15 m/s, t = 2 s.",
          "Use s = ut + ½at².",
          "Substitute: s = (15)(2) + ½(−10)(4) = 30 − 20.",
        ],
        answer: "s = 10 m above the starting point",
      },
      {
        title: "Using v² = u² + 2as",
        problem: "A car decelerates from 30 m/s to rest over a distance of 75 m. Find its deceleration.",
        steps: [
          "Identify u = 30 m/s, v = 0 m/s, s = 75 m.",
          "Use v² = u² + 2as, solving for a: a = (v² − u²)/(2s).",
          "Substitute: a = (0 − 900)/150.",
        ],
        answer: "a = −6 m/s² (deceleration of 6 m/s²)",
      },
    ],
    applications: [
      { title: "Vehicle Safety and Braking Distance", description: "Automotive engineers use the equations of motion to calculate stopping distances at different speeds, informing speed limits and braking design." },
      { title: "Sports Performance Analysis", description: "Coaches analyze sprinters' velocity-time graphs to identify acceleration phases and optimize starting technique." },
      { title: "Rocket and Projectile Launches", description: "Motion-under-gravity equations predict the maximum height, flight time, and landing point of rockets and projectiles." },
    ],
    formulae: [
      { name: "First Equation of Motion", expression: "v = u + at", description: "Relates final velocity to initial velocity, acceleration, and time." },
      { name: "Second Equation of Motion", expression: "s = ut + ½at²", description: "Gives displacement in terms of initial velocity, time, and acceleration." },
      { name: "Third Equation of Motion", expression: "v² = u² + 2as", description: "Relates velocities and displacement without needing time." },
      { name: "Average Velocity", expression: "v_avg = (u + v) / 2", description: "Valid only for uniformly accelerated motion." },
    ],
    summary: [
      "Distance and speed are scalars; displacement and velocity are vectors.",
      "Acceleration is the rate of change of velocity: a = Δv/Δt.",
      "The three equations of motion fully describe uniformly accelerated motion.",
      "Slope of a position-time graph gives velocity; slope of a velocity-time graph gives acceleration.",
      "Motion under gravity is uniformly accelerated motion with a = ±g.",
    ],
    flashcards: [
      { id: "fc-mot-1", front: "v = u + at is used to find...?", back: "Final velocity given initial velocity, acceleration, and time." },
      { id: "fc-mot-2", front: "What does the area under a v-t graph represent?", back: "The displacement of the object." },
      { id: "fc-mot-3", front: "Difference between speed and velocity?", back: "Speed is a scalar; velocity is a vector (magnitude and direction)." },
      { id: "fc-mot-4", front: "Value of g near Earth's surface?", back: "≈ 9.8 m/s², directed downward." },
      { id: "fc-mot-5", front: "v² = u² + 2as is useful when...?", back: "Time is not known or not needed." },
      { id: "fc-mot-6", front: "Slope of a position-time graph gives?", back: "Instantaneous velocity." },
    ],
    revisionNotes: [
      "Always define a positive direction before starting a motion problem.",
      "For objects thrown upward, take a = −g; for falling objects, a = +g.",
      "Check units are in SI (m, s, m/s²) before substituting into equations.",
      "A curved position-time graph means the object is accelerating.",
      "Use s = ut + ½at² when time is known; use v² = u² + 2as when it isn't.",
    ],
  },
  "phy-t10": {
    objectives: [
      "State Newton's Second Law of Motion in words and as an equation.",
      "Relate force, mass, and acceleration using F = ma.",
      "Understand linear momentum and its rate of change.",
      "Apply Newton's Second Law to solve numerical problems involving multiple forces.",
      "Analyze connected bodies (like blocks joined by a string) using free-body diagrams.",
    ],
    theory: [
      "Newton's Second Law states that the rate of change of momentum of a body is directly proportional to the net external force applied, and the change occurs in the direction of the force. Momentum p = mv. When mass is constant, this simplifies to the familiar form F = ma.",
      "This law quantifies exactly how a given force changes motion. A larger net force produces greater acceleration on the same mass; the same force produces less acceleration on a larger mass. If the net force is zero, acceleration is zero — the object continues at constant velocity or stays at rest, consistent with Newton's First Law.",
      "In real problems, multiple forces act simultaneously — gravity, normal reaction, tension, friction, applied push or pull. Newton's Second Law applies to the net (resultant) force, found by vector addition. Free-body diagrams — sketches showing every force acting on an object — are the standard technique for identifying and summing these forces before applying F = ma.",
      "For connected bodies, such as two blocks joined by a string over a pulley, Newton's Second Law is applied separately to each body. Since an inextensible string forces both bodies to share the same acceleration magnitude, the two equations can be solved together for unknowns like tension and acceleration.",
    ],
    illustrations: [
      { title: "Free-Body Diagram of a Block", caption: "A block shown with force arrows: weight (down), normal force (up), applied force (forward), and friction (backward).", kind: "diagram" },
      { title: "F = ma Relationship Graph", caption: "A straight-line graph of acceleration against force for a fixed mass, showing direct proportionality.", kind: "graph" },
      { title: "Connected Blocks Over a Pulley", caption: "Two blocks connected by a string over a frictionless pulley, with tension arrows shown on both sides.", kind: "diagram" },
    ],
    examples: [
      {
        title: "Basic Application of F = ma",
        problem: "A net force of 20 N acts on a 4 kg block. Find its acceleration.",
        steps: ["Identify F = 20 N and m = 4 kg.", "Use a = F/m.", "Substitute: a = 20/4."],
        answer: "a = 5 m/s²",
      },
      {
        title: "Force from Change in Momentum",
        problem: "A 0.5 kg ball's velocity changes from 2 m/s to 10 m/s in 0.4 s. Find the average force applied.",
        steps: ["Find Δp = m(v−u) = 0.5(10−2) = 4 kg·m/s.", "Use F = Δp/Δt.", "Substitute: F = 4/0.4."],
        answer: "F = 10 N",
      },
      {
        title: "Connected Blocks and Tension",
        problem: "Two blocks of mass 3 kg and 2 kg are connected by a string over a frictionless pulley. Find the acceleration of the system (g = 10 m/s²).",
        steps: [
          "For the 3 kg block: 3g − T = 3a. For the 2 kg block: T − 2g = 2a.",
          "Add both equations to eliminate T: g = 5a.",
          "Substitute g = 10: a = 10/5.",
        ],
        answer: "a = 2 m/s²",
      },
    ],
    applications: [
      { title: "Vehicle Design and Crash Safety", description: "Engineers use F = ma to design crumple zones and airbags that reduce collision force by increasing the time over which momentum changes." },
      { title: "Rocket Propulsion", description: "Rocket engines apply Newton's Second Law by expelling fuel at high speed, generating the thrust needed to accelerate the rocket." },
      { title: "Elevator and Lift Systems", description: "Engineers calculate cable tension using F = ma, accounting for the combined weight and required acceleration of the elevator car." },
    ],
    formulae: [
      { name: "Newton's Second Law", expression: "F = ma", description: "Net force equals mass times acceleration, for constant mass." },
      { name: "General (Momentum) Form", expression: "F = Δp/Δt", description: "Force equals the rate of change of momentum — the most general form of the law." },
      { name: "Impulse-Momentum Relation", expression: "F · Δt = Δp", description: "Impulse (force × time) equals the change in momentum." },
    ],
    summary: [
      "Newton's Second Law: net force equals the rate of change of momentum, simplifying to F = ma.",
      "Acceleration is directly proportional to net force and inversely proportional to mass.",
      "Free-body diagrams help correctly sum all forces before applying F = ma.",
      "Connected bodies share the same acceleration magnitude via an inextensible string.",
      "Impulse (F·Δt) equals the change in momentum — useful when force acts briefly.",
    ],
    flashcards: [
      { id: "fc-n2-1", front: "State Newton's Second Law.", back: "Rate of change of momentum is proportional to net force, in the direction of the force: F = ma." },
      { id: "fc-n2-2", front: "Formula for momentum?", back: "p = mv" },
      { id: "fc-n2-3", front: "What does a free-body diagram show?", back: "All individual forces acting on a single object, drawn as arrows." },
      { id: "fc-n2-4", front: "Impulse formula?", back: "Impulse = F × Δt = Δp" },
      { id: "fc-n2-5", front: "If net force is zero, what happens to acceleration?", back: "Acceleration is zero — constant velocity or rest." },
      { id: "fc-n2-6", front: "Why do connected blocks share acceleration?", back: "Because an inextensible string forces them to move together." },
    ],
    revisionNotes: [
      "F = ma only holds when mass is constant; use F = dp/dt otherwise.",
      "Always draw a free-body diagram before writing equations.",
      "Net force is the vector sum of all forces, not just the applied force.",
      "Tension is uniform throughout an ideal string only with a massless, frictionless pulley.",
      "Units: Force in Newtons (N) = kg·m/s².",
    ],
  },
  "phy-t12": {
    objectives: [
      "Define friction and distinguish static, kinetic, and rolling friction.",
      "Explain the laws of limiting friction and the coefficient of friction.",
      "Calculate maximum static friction and kinetic friction using μN.",
      "Analyze motion on horizontal and inclined surfaces with friction.",
      "Evaluate friction as both a hindrance and a necessity in everyday life.",
    ],
    theory: [
      "Friction is the opposing force between two surfaces in contact when one moves or tends to move relative to the other. It acts parallel to the contact surfaces and opposes relative motion. Friction arises mainly from microscopic surface irregularities that interlock, and to a lesser extent from molecular attraction between surfaces in close contact.",
      "There are three main types: static friction acts on objects not yet moving and adjusts up to a maximum value; kinetic friction acts on objects already sliding, and is usually slightly less than maximum static friction; rolling friction acts on rolling objects and is much smaller than sliding friction — why wheels and ball bearings reduce energy loss.",
      "The maximum static friction and kinetic friction are both proportional to the normal reaction force (N), through the coefficient of friction (μ), which depends on the surfaces in contact: f_s(max) = μₛN and f_k = μₖN, where μₖ is typically slightly smaller than μₛ.",
      "On an inclined plane, the component of gravity along the incline (mg sin θ) tends to pull an object down, while friction (up to μN) resists this. The angle at which an object just begins to slide under its own weight — the angle of repose — satisfies tan θ = μₛ.",
    ],
    illustrations: [
      { title: "Friction Force Diagram", caption: "A block on a surface with an applied force arrow, a friction force arrow opposing it, and normal/weight arrows perpendicular to the surface.", kind: "diagram" },
      { title: "Static vs Kinetic Friction Graph", caption: "A graph of friction force against applied force, rising until it plateaus at maximum static friction, then dropping slightly to a constant kinetic level once motion begins.", kind: "graph" },
      { title: "Block on an Inclined Plane", caption: "A block on a ramp with gravity resolved into mg sin θ (along the incline) and mg cos θ (perpendicular), with friction acting up the incline.", kind: "diagram" },
    ],
    examples: [
      {
        title: "Finding Kinetic Friction Force",
        problem: "A 10 kg block slides on a floor with μₖ = 0.3. Find the friction force (g = 10 m/s²).",
        steps: ["Find N = mg = 10×10 = 100 N.", "Use f_k = μₖN.", "Substitute: f_k = 0.3 × 100."],
        answer: "f_k = 30 N",
      },
      {
        title: "Minimum Force to Start Motion",
        problem: "A 5 kg box has μₛ = 0.4 with the floor. What minimum horizontal force just starts it moving (g = 10 m/s²)?",
        steps: ["Find N = mg = 5×10 = 50 N.", "The box moves when F exceeds μₛN.", "Substitute: F = 0.4 × 50."],
        answer: "F = 20 N",
      },
      {
        title: "Angle of Repose",
        problem: "A block on an inclined plane just begins to slide when the incline is raised to 20°. Find the coefficient of static friction.",
        steps: ["At the angle of repose, tan θ = μₛ.", "Substitute θ = 20°.", "Compute tan 20° ≈ 0.364."],
        answer: "μₛ ≈ 0.36",
      },
    ],
    applications: [
      { title: "Vehicle Tyres and Braking", description: "Tyre tread patterns maximize static friction with the road, allowing a car to accelerate, turn, and brake without skidding." },
      { title: "Walking and Footwear Design", description: "Friction between shoes and the ground lets humans walk without slipping; soles are textured to optimize friction on different surfaces." },
      { title: "Machine Lubrication", description: "Lubricants reduce kinetic friction between moving machine parts, cutting wear and energy loss as heat." },
    ],
    formulae: [
      { name: "Maximum Static Friction", expression: "f_s(max) = μₛN", description: "The maximum friction force before an object starts to slide." },
      { name: "Kinetic Friction", expression: "f_k = μₖN", description: "The friction force while an object is already sliding." },
      { name: "Angle of Repose", expression: "tan θ = μₛ", description: "The incline angle at which an object on the verge of sliding satisfies this relation." },
    ],
    summary: [
      "Friction opposes relative motion (or tendency of motion) between two surfaces.",
      "Static friction adjusts up to a maximum (μₛN); kinetic friction is roughly constant (μₖN).",
      "Rolling friction is much smaller than sliding friction, which is why wheels are efficient.",
      "The angle of repose (tan θ = μₛ) tells you when sliding begins on an incline.",
      "Friction is essential for walking and driving, even though it also causes wear and energy loss.",
    ],
    flashcards: [
      { id: "fc-fric-1", front: "What is limiting friction?", back: "The maximum value of static friction, just before an object starts to move." },
      { id: "fc-fric-2", front: "Formula for kinetic friction?", back: "f_k = μₖN" },
      { id: "fc-fric-3", front: "Which is usually larger, μₛ or μₖ?", back: "μₛ is usually slightly larger than μₖ." },
      { id: "fc-fric-4", front: "What is the angle of repose?", back: "The incline angle where tan θ = μₛ and the object just begins to slide." },
      { id: "fc-fric-5", front: "Why is rolling friction less than sliding friction?", back: "Rolling involves much less surface deformation and interlocking than sliding." },
      { id: "fc-fric-6", front: "Does friction depend on contact area?", back: "No — it depends on the normal force and μ, not the contact area." },
    ],
    revisionNotes: [
      "Friction always opposes relative motion, never helps it along.",
      "f = μN — memorize this; μ depends on the surface pair, not on N alone.",
      "Static friction is self-adjusting up to its maximum value.",
      "On an incline: N = mg cos θ, driving force = mg sin θ.",
      "Angle of repose = tan⁻¹(μₛ), independent of the object's mass.",
    ],
  },
};

function genericContent(topicName: string, chapterName: string, subjectName: string): TopicContent {
  return {
    objectives: [
      `Understand the core definition and scope of ${topicName}.`,
      `Recall the key terms, laws, or formulae associated with ${topicName}.`,
      `Apply ${topicName} concepts to solve typical ${chapterName} problems.`,
      `Connect ${topicName} to other topics within ${chapterName}.`,
    ],
    theory: [
      `${topicName} is a core concept within the "${chapterName}" chapter of ${subjectName}. It builds on foundational ideas covered earlier in the chapter and introduces the terminology and techniques CBSE Class 11 students are expected to master for this topic.`,
      `A solid grasp of ${topicName} begins with understanding its formal definition, followed by practicing how it connects to adjacent concepts in ${chapterName}. Working through solved examples is the fastest way to internalize the underlying pattern.`,
      `Once the basic idea is clear, ${topicName} is usually extended to more complex, multi-step problems that combine it with other parts of ${chapterName}. These test not just recall, but the ability to apply the concept flexibly across different question styles.`,
    ],
    illustrations: [
      { title: `${topicName} — Concept Diagram`, caption: `A labeled diagram illustrating the key components and relationships involved in ${topicName}.`, kind: "diagram" },
      { title: `${topicName} — Worked Visual`, caption: `A step-by-step visual walkthrough of a standard ${topicName} problem.`, kind: "figure" },
    ],
    examples: [
      {
        title: `Standard ${topicName} Problem`,
        problem: `Apply the core rule of ${topicName} to a typical exam-style question from ${chapterName}.`,
        steps: [
          "Identify the given information and what is being asked.",
          `Recall the relevant formula or rule for ${topicName}.`,
          "Substitute the known values carefully.",
          "Simplify step by step to reach the final answer.",
        ],
        answer: `Final answer follows directly from applying the ${topicName} rule above.`,
      },
    ],
    applications: [
      { title: "Academic Foundation", description: `${topicName} builds the foundation for more advanced topics later in the ${subjectName} syllabus.` },
      { title: "Exam Relevance", description: `${topicName} is a frequently tested concept in CBSE Class 11 ${subjectName} chapter tests and board exam patterns.` },
    ],
    formulae: [
      { name: `${topicName} — Key Relation`, expression: `See NCERT ${subjectName} textbook, "${chapterName}"`, description: `The primary formula or rule used when solving ${topicName} problems.` },
    ],
    summary: [
      `${topicName} is a key concept in the "${chapterName}" chapter.`,
      `Mastering ${topicName} requires understanding its definition, formula, and worked examples.`,
      `Regular practice with varied problems strengthens long-term retention of ${topicName}.`,
    ],
    flashcards: [
      { id: "fc-gen-1", front: `What is ${topicName}?`, back: `A key concept in ${chapterName} — review the topic theory for the full definition.` },
      { id: "fc-gen-2", front: `Where is ${topicName} used?`, back: `In ${chapterName} problems within ${subjectName}, and in later chapters that build on it.` },
      { id: "fc-gen-3", front: `Best way to revise ${topicName}?`, back: "Re-work the solved examples, then attempt fresh practice questions without looking at the solution." },
    ],
    revisionNotes: [
      `Revisit the definition of ${topicName} before attempting problems.`,
      "Practice the worked examples until you can solve them without hints.",
      `Connect ${topicName} back to the broader "${chapterName}" chapter for context.`,
    ],
  };
}

export function getTopicContent(subjectSlug: string, topicSlug: string) {
  const found = getChapterAndTopic(subjectSlug, topicSlug);
  if (!found) return null;
  const { subject, chapter, topic } = found;
  const content = authoredContent[topic.id] ?? genericContent(topic.name, chapter.name, subject.name);
  return { subject, chapter, topic, content };
}
