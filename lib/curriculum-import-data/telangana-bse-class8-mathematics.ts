// Approved, source-grounded curriculum extraction for one specific
// board-specific subject: Telangana -> BSE Telangana -> Class 8 ->
// Mathematics. Chapter/topic names, order, and structure are taken
// verbatim from the official BSE Telangana Class 8 Mathematics textbook
// (2025-26 edition) - nothing here is invented, renamed, or simplified.
// bloomLevel is deliberately uniform (UNDERSTAND) for every topic: the
// source textbook doesn't tag sections with Bloom's-taxonomy levels, so
// this is a neutral placeholder pending a real pedagogical classification
// pass, not something read from the textbook. Consumed once by the
// "Import approved textbook curriculum" admin action
// (lib/actions/curriculum-admin.ts's bulkImportCurriculum) - not used by
// prisma/seed.ts or any other feature.
import { BloomLevel } from "@prisma/client";

export interface CurriculumImportTopic {
  name: string;
  slug: string;
  bloomLevel: BloomLevel;
}

export interface CurriculumImportChapter {
  name: string;
  slug: string;
  topics: CurriculumImportTopic[];
}

function t(name: string, slug: string): CurriculumImportTopic {
  return { name, slug, bloomLevel: BloomLevel.UNDERSTAND };
}

export const TELANGANA_BSE_CLASS8_MATHEMATICS: CurriculumImportChapter[] = [
  {
    name: "Rational Numbers", slug: "rational-numbers",
    topics: [
      t("Operations on Rational numbers", "operations-on-rational-numbers"),
      t("Multiplication of Rational Numbers", "multiplication-of-rational-numbers"),
      t("Division of Rational Numbers", "division-of-rational-numbers"),
      t("Properties of Rational numbers", "properties-of-rational-numbers"),
      t("Closure property", "closure-property"),
      t("Commutative Property", "commutative-property"),
      t("Associative Property", "associative-property"),
      t("The Role of Zero", "the-role-of-zero"),
      t("The Role of 1", "the-role-of-1"),
      t("Existence of Inverse", "existence-of-inverse"),
      t("Distributivity of multiplication over addition", "distributivity-of-multiplication-over-addition"),
      t("Representation of Rational numbers on Number line", "representation-of-rational-numbers-on-number-line"),
      t("Rational Number between Two Rational Numbers", "rational-number-between-two-rational-numbers"),
      t("Decimal representation of Rational numbers", "decimal-representation-of-rational-numbers"),
      t("Conversion of decimal form into rational form", "conversion-of-decimal-form-into-rational-form"),
      t("Converting terminating decimal into rational form", "converting-terminating-decimal-into-rational-form"),
      t("Converting a non-terminating recurring decimal into rational form", "converting-a-non-terminating-recurring-decimal-into-rational-form"),
    ],
  },
  {
    name: "Linear Equations in One Variable", slug: "linear-equations-in-one-variable",
    topics: [
      t("Linear Equations", "linear-equations"),
      t("Simple equations or Linear equations in one variable", "simple-equations-or-linear-equations-in-one-variable"),
      t("Solving Simple equation having the variable on one side", "solving-simple-equation-having-the-variable-on-one-side"),
      t("Some Applications", "some-applications"),
      t("Solving equation that has variables on both the sides", "solving-equation-that-has-variables-on-both-the-sides"),
      t("Some more applications", "some-more-applications"),
      t("Reducing Equations", "reducing-equations"),
    ],
  },
  {
    name: "Construction of Quadrilaterals", slug: "construction-of-quadrilaterals",
    topics: [
      t("Quadrilaterals and their Properties", "quadrilaterals-and-their-properties"),
      t("Constructing a Quadrilateral", "constructing-a-quadrilateral"),
      t("Construction: When the lengths of four sides and one angle are given (S.S.S.S.A)", "construction-when-the-lengths-of-four-sides-and-one-angle-are-given-s-s-s-s-a"),
      t("Construction: When the lengths of four sides and a diagonal is given (S.S.S.S.D)", "construction-when-the-lengths-of-four-sides-and-a-diagonal-is-given-s-s-s-s-d"),
      t("Construction: When the lengths of three sides and two diagonals are given", "construction-when-the-lengths-of-three-sides-and-two-diagonals-are-given"),
      t("Construction: When the lengths of two adjacent sides and three angles are given", "construction-when-the-lengths-of-two-adjacent-sides-and-three-angles-are-given"),
      t("Construction: When the lengths of three sides and two included angles are given", "construction-when-the-lengths-of-three-sides-and-two-included-angles-are-given"),
      t("Construction of Special types Quadrilaterals", "construction-of-special-types-quadrilaterals"),
    ],
  },
  {
    name: "Exponents and Powers", slug: "exponents-and-powers",
    topics: [
      t("Powers with Negative Exponents", "powers-with-negative-exponents"),
      t("Laws of Exponents", "laws-of-exponents"),
      t("Application of Exponents to Express numbers in Standard Form", "application-of-exponents-to-express-numbers-in-standard-form"),
      t("Comparing very large and very small numbers", "comparing-very-large-and-very-small-numbers"),
    ],
  },
  {
    name: "Comparing Quantities using Proportion", slug: "comparing-quantities-using-proportion",
    topics: [
      t("Finding the increase or decrease percent", "finding-the-increase-or-decrease-percent"),
      t("Finding discounts", "finding-discounts"),
      t("Estimation in percentages", "estimation-in-percentages"),
      t("Profit and Loss", "profit-and-loss"),
      t("Sales Tax / Value Added Tax (VAT)", "sales-tax-value-added-tax-vat"),
      t("Goods and Service Tax (GST)", "goods-and-service-tax-gst"),
      t("Compound Interest", "compound-interest"),
      t("Deducing a formula for Compound interest", "deducing-a-formula-for-compound-interest"),
      t("Interest compounded annually or Half yearly (Semi Annually)", "interest-compounded-annually-or-half-yearly-semi-annually"),
      t("Application of Compound Interest formula", "application-of-compound-interest-formula"),
    ],
  },
  {
    name: "Square Roots and Cube Roots", slug: "square-roots-and-cube-roots",
    topics: [
      t("Properties of square numbers", "properties-of-square-numbers"),
      t("Interesting patterns in square", "interesting-patterns-in-square"),
      t("Pythagorean triplets", "pythagorean-triplets"),
      t("Square Roots", "square-roots"),
      t("Finding the Square root through subtraction of successive odd numbers", "finding-the-square-root-through-subtraction-of-successive-odd-numbers"),
      t("Finding the Square Root Through Prime Factorisation Method", "finding-the-square-root-through-prime-factorisation-method"),
      t("Finding square root by division method", "finding-square-root-by-division-method"),
      t("Square root of decimal numbers using division method", "square-root-of-decimal-numbers-using-division-method"),
      t("Estimating square roots of non perfect square numbers", "estimating-square-roots-of-non-perfect-square-numbers"),
      t("Cubic Numbers", "cubic-numbers"),
      t("Some interesting patterns", "some-interesting-patterns"),
      t("Cubes and their Prime Factors", "cubes-and-their-prime-factors"),
      t("Cube roots", "cube-roots"),
      t("Finding cube root through Prime Factorization method", "finding-cube-root-through-prime-factorization-method"),
      t("Estimating the cube root of a number", "estimating-the-cube-root-of-a-number"),
    ],
  },
  {
    name: "Frequency Distribution Tables and Graphs", slug: "frequency-distribution-tables-and-graphs",
    topics: [
      t("Basic measures of central tendency", "basic-measures-of-central-tendency"),
      t("Arithmetic Mean", "arithmetic-mean"),
      t("Arithmetic Mean by Deviation Method", "arithmetic-mean-by-deviation-method"),
      t("Median", "median"),
      t("Mode", "mode"),
      t("Organisation of Grouped Data", "organisation-of-grouped-data"),
      t("Interpretation of Grouped frequency distribution", "interpretation-of-grouped-frequency-distribution"),
      t("Limits and Boundaries", "limits-and-boundaries"),
      t("Construction of grouped frequency Distribution", "construction-of-grouped-frequency-distribution"),
      t("Characteristics of Grouped Frequency Distribution", "characteristics-of-grouped-frequency-distribution"),
      t("Cumulative Frequency", "cumulative-frequency"),
      t("Graphical Representation of Data", "graphical-representation-of-data"),
      t("Bar Graph", "bar-graph"),
      t("Graphical Representation of Grouped Frequency Distribution", "graphical-representation-of-grouped-frequency-distribution"),
      t("Histogram", "histogram"),
      t("Frequency Polygon", "frequency-polygon"),
      t("Frequency Curve for a grouped frequency distribution", "frequency-curve-for-a-grouped-frequency-distribution"),
      t("Graph of a Cumulative Frequency Distribution", "graph-of-a-cumulative-frequency-distribution"),
    ],
  },
  {
    name: "Exploring Geometrical Figures", slug: "exploring-geometrical-figures",
    topics: [
      t("Congruency", "congruency"),
      t("Congruency of shapes", "congruency-of-shapes"),
      t("Similar shapes", "similar-shapes"),
      t("Where do we find the application of similarity?", "where-do-we-find-the-application-of-similarity"),
      t("Dilations", "dilations"),
      t("Constructing a Dilation", "constructing-a-dilation"),
      t("Symmetry", "symmetry"),
      t("Rotational symmetry", "rotational-symmetry"),
      t("Point symmetry", "point-symmetry"),
      t("Applications of symmetry", "applications-of-symmetry"),
    ],
  },
  {
    name: "Area of Plane Figures", slug: "area-of-plane-figures",
    topics: [
      t("Area of a Trapezium", "area-of-a-trapezium"),
      t("Area of a Quadrilateral", "area-of-a-quadrilateral"),
      t("Area of Rhombus", "area-of-rhombus"),
      t("Surveying the field", "surveying-the-field"),
      t("Area of a Polygon", "area-of-a-polygon"),
      t("Area of circle", "area-of-circle"),
      t("Area of a Circular Path or Area of a ring", "area-of-a-circular-path-or-area-of-a-ring"),
      t("Length of the arc", "length-of-the-arc"),
      t("Area of Sector", "area-of-sector"),
    ],
  },
  {
    name: "Direct and Inverse Proportions", slug: "direct-and-inverse-proportions",
    topics: [
      t("Direct Proportion", "direct-proportion"),
      t("Inverse Proportion", "inverse-proportion"),
      t("Compound Proportion", "compound-proportion"),
    ],
  },
  {
    name: "Algebraic Expressions", slug: "algebraic-expressions",
    topics: [
      t("Like and unlike terms", "like-and-unlike-terms"),
      t("Addition and subtraction of algebraic expressions", "addition-and-subtraction-of-algebraic-expressions"),
      t("Multiplication of Algebraic Expressions", "multiplication-of-algebraic-expressions"),
      t("Multiplying a monomial by a monomial", "multiplying-a-monomial-by-a-monomial"),
      t("Multiplying two monomials", "multiplying-two-monomials"),
      t("Multiplying three or more monomials", "multiplying-three-or-more-monomials"),
      t("Multiplying a binomial or trinomial by a monomial", "multiplying-a-binomial-or-trinomial-by-a-monomial"),
      t("Multiplying a binomial by a monomial", "multiplying-a-binomial-by-a-monomial"),
      t("Multiplying a trinomial by a monomial", "multiplying-a-trinomial-by-a-monomial"),
      t("Multiplying a binomial by a binomial or trinomial", "multiplying-a-binomial-by-a-binomial-or-trinomial"),
      t("Multiplying a binomial by a binomial", "multiplying-a-binomial-by-a-binomial"),
      t("Multiplying a binomial by a trinomial", "multiplying-a-binomial-by-a-trinomial"),
      t("What is an identity?", "what-is-an-identity"),
      t("Some important Identities", "some-important-identities"),
      t("Application of Identities", "application-of-identities"),
      t("Geometrical Verification of the identities", "geometrical-verification-of-the-identities"),
      t("Geometrical Verification of the identity (a + b)² = a² + 2ab + b²", "geometrical-verification-of-the-identity-a-b-a-2ab-b"),
      t("Geometrical Verification of the identity (a − b)² = a² − 2ab + b²", "geometrical-verification-of-the-identity-a-b-a-2ab-b-2"),
      t("Geometrical Verification of the identity (a + b)(a − b) = a² − b²", "geometrical-verification-of-the-identity-a-b-a-b-a-b"),
    ],
  },
  {
    name: "Factorisation", slug: "factorisation",
    topics: [
      t("Factors of algebraic expressions", "factors-of-algebraic-expressions"),
      t("Need of factorisation", "need-of-factorisation"),
      t("Method of common factors", "method-of-common-factors"),
      t("Factorisation by grouping the terms", "factorisation-by-grouping-the-terms"),
      t("Factorisation using identities", "factorisation-using-identities"),
      t("Factors of the expression in the form of (x + a)(x + b) = x² + (a + b)x + ab", "factors-of-the-expression-in-the-form-of-x-a-x-b-x-a-b-x-ab"),
      t("Division of algebraic expressions", "division-of-algebraic-expressions"),
      t("Division of a monomial by another monomial", "division-of-a-monomial-by-another-monomial"),
      t("Division of an expression by a monomial", "division-of-an-expression-by-a-monomial"),
      t("Division of Expression by Expression", "division-of-expression-by-expression"),
    ],
  },
  {
    name: "Visualising 3-D in 2-D", slug: "visualising-3-d-in-2-d",
    topics: [
      t("3-D Objects made with cubes", "3-d-objects-made-with-cubes"),
      t("Representation of 3-D figures on 2-D", "representation-of-3-d-figures-on-2-d"),
      t("Various Geometrical Solids", "various-geometrical-solids"),
      t("Faces, Edges and Vertices of 3D-Objects", "faces-edges-and-vertices-of-3d-objects"),
      t("Regular Polyhedron", "regular-polyhedron"),
      t("Prism and Pyramid", "prism-and-pyramid"),
      t("Number of Edges, Faces and Vertices of polyhedrons", "number-of-edges-faces-and-vertices-of-polyhedrons"),
      t("Net Diagrams", "net-diagrams"),
    ],
  },
  {
    name: "Surface Areas And Volume (Cube and Cuboid)", slug: "surface-areas-and-volume-cube-and-cuboid",
    topics: [
      t("Cuboid", "cuboid"),
      t("Lateral Surface Area", "lateral-surface-area"),
      t("Cube", "cube"),
      t("Volume of Cube and Cuboid", "volume-of-cube-and-cuboid"),
      t("Volume of a Cuboid", "volume-of-a-cuboid"),
      t("Volume of a Cube", "volume-of-a-cube"),
    ],
  },
  {
    name: "Playing with Numbers", slug: "playing-with-numbers",
    topics: [
      t("Divisibility Rules", "divisibility-rules"),
      t("Place value of a digit", "place-value-of-a-digit"),
      t("Expanded form of numbers", "expanded-form-of-numbers"),
      t("Factors and Multiples of numbers", "factors-and-multiples-of-numbers"),
      t("Divisibility by 10", "divisibility-by-10"),
      t("Divisibility by 5", "divisibility-by-5"),
      t("Divisibility by 2", "divisibility-by-2"),
      t("Divisibility by 3 and 9", "divisibility-by-3-and-9"),
      t("Divisibility by 6", "divisibility-by-6"),
      t("Divisibility by 4 and 8", "divisibility-by-4-and-8"),
      t("Divisibility by 7", "divisibility-by-7"),
      t("Divisibility by 11", "divisibility-by-11"),
      t("Some More Divisibility Rules", "some-more-divisibility-rules"),
      t("Puzzles based on divisibility rules", "puzzles-based-on-divisibility-rules"),
      t("Fun with 3-Digit Numbers", "fun-with-3-digit-numbers"),
      t("Puzzles with missing digits", "puzzles-with-missing-digits"),
      t("Finding of divisibility by taking remainders of place values", "finding-of-divisibility-by-taking-remainders-of-place-values"),
      t("Some more puzzles on divisibility rules", "some-more-puzzles-on-divisibility-rules"),
      t("Finding Sum of Consecutive numbers", "finding-sum-of-consecutive-numbers"),
    ],
  },
];
