// Literal terms and documented spelling aliases. These detect text, not proficiency.
const groups: [string, string[]][] = [
  ["C++", ["C++"]],
  ["C#", ["C#", "C sharp"]],
  ["C", ["C"]],
  ["Java", ["Java"]],
  ["JavaScript", ["JavaScript"]],
  ["TypeScript", ["TypeScript"]],
  ["Python", ["Python"]],
  ["Rust", ["Rust"]],
  ["Go", ["Golang", "Go programming"]],
  ["SQL", ["SQL", "MySQL", "PostgreSQL", "SQLite", "MSSQL"]],
  ["React", ["React", "React.js", "ReactJS"]],
  ["Node.js", ["Node.js", "NodeJS", "Node JS"]],
  ["Vue", ["Vue", "Vue.js"]],
  ["Angular", ["Angular"]],
  [".NET", [".NET", "dotnet"]],
  ["Spring", ["Spring Boot", "Spring"]],
  ["Django", ["Django"]],
  ["Flask", ["Flask"]],
  ["Unity", ["Unity", "Unity3D"]],
  ["Unreal", ["Unreal", "Unreal Engine"]],
  ["Docker", ["Docker"]],
  ["Kubernetes", ["Kubernetes", "K8s"]],
  ["AWS", ["AWS", "Amazon Web Services"]],
  ["Azure", ["Azure"]],
  ["Google Cloud", ["Google Cloud", "GCP"]],
  ["Git", ["Git"]],
  ["GitHub", ["GitHub"]],
  ["Linux", ["Linux"]],
  ["REST", ["REST", "RESTful"]],
  ["API", ["API", "APIs"]],
  ["HTML", ["HTML", "HTML5"]],
  ["CSS", ["CSS", "CSS3"]],
  ["TensorFlow", ["TensorFlow"]],
  ["PyTorch", ["PyTorch"]],
  ["OpenCV", ["OpenCV"]],
  ["computer vision", ["computer vision"]],
  ["machine learning", ["machine learning"]],
  ["deep learning", ["deep learning"]],
  ["LLM", ["LLM", "LLMs", "large language model"]],
  ["data structures", ["data structures"]],
  ["algorithms", ["algorithms"]],
  ["testing", ["testing", "unit tests", "unit testing", "automated tests"]],
  ["CI/CD", ["CI/CD", "continuous integration", "continuous delivery"]],
  ["networking", ["networking", "TCP/IP", "network protocols"]],
  [
    "cybersecurity",
    ["cybersecurity", "cyber security", "information security"],
  ],
  ["embedded systems", ["embedded systems", "embedded software"]],
  ["FPGA", ["FPGA"]],
  ["Verilog", ["Verilog"]],
  ["MATLAB", ["MATLAB"]],
  ["Excel", ["Excel"]],
  ["Power BI", ["Power BI", "PowerBI"]],
  ["Tableau", ["Tableau"]],
  ["Salesforce", ["Salesforce"]],
  ["Figma", ["Figma"]],
  ["Agile", ["Agile", "Scrum"]],
  ["communication", ["communication", "communicate", "communicating"]],
  [
    "teamwork",
    [
      "teamwork",
      "team player",
      "collaboration",
      "collaborate",
      "cross-functional",
    ],
  ],
  ["problem solving", ["problem solving", "problem-solving"]],
  ["presentations", ["presentations", "presentation skills", "presenting"]],
  ["documentation", ["documentation", "technical writing"]],
  [
    "customer support",
    [
      "customer support",
      "technical support",
      "customer-facing",
      "client-facing",
    ],
  ],
];
export function termQuote(text: string, term: string): string | null {
  const aliases = groups.find(
    ([name]) => name.toLowerCase() === term.toLowerCase(),
  )?.[1] ?? [term];
  for (const alias of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = text.matchAll(
      new RegExp(
        `(^|[^\\p{L}\\p{N}_])(${escaped})(?=$|[^\\p{L}\\p{N}_+#])`,
        "giu",
      ),
    );
    for (const m of matches) {
      const at = m.index + m[1].length;
      // A portfolio/contact URL alone is not evidence of using that technology.
      if (/^\.(?:com|org|net|io|ai)\b/i.test(text.slice(at + m[2].length)))
        continue;
      const start = text.lastIndexOf("\n", at) + 1,
        end = text.indexOf("\n", at);
      return text.slice(start, end < 0 ? text.length : end).trim();
    }
  }
  return null;
}
export function detectedTerms(text: string, explicit: string[] = []): string[] {
  return [
    ...new Set([
      ...explicit,
      ...groups.filter(([name]) => termQuote(text, name)).map(([name]) => name),
    ]),
  ].filter(
    (name, i, all) =>
      all.findIndex((v) => v.toLowerCase() === name.toLowerCase()) === i,
  );
}
