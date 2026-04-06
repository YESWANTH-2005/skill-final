const ROLE_PROFILES = {
  data_analyst: {
    label: "Data Analyst",
    requiredSignals: ["sql", "analytics", "data", "visual", "dashboard"]
  },
  frontend_developer: {
    label: "Frontend Developer",
    requiredSignals: ["javascript", "react", "frontend", "web", "ui"]
  },
  product_designer: {
    label: "Product Designer",
    requiredSignals: ["design", "ux", "research", "figma", "prototyp"]
  },
  growth_marketer: {
    label: "Growth Marketer",
    requiredSignals: ["marketing", "seo", "content", "email", "automation"]
  },
  ml_engineer: {
    label: "ML Engineer",
    requiredSignals: ["python", "machine learning", "ai", "model", "data"]
  }
};

function inferWeeklyHours() {
  const time = String(state.quizAnswers.time || "").toLowerCase();
  if (time.includes("1") && time.includes("3")) return 2;
  if (time.includes("4") && time.includes("8")) return 6;
  if (time.includes("8") && time.includes("15")) return 11;
  if (time.includes("full-time")) return 25;
  return 5;
}

function skillSearchBlob(skill) {
  return [skill.title, ...(skill.tags || []), ...(skill.categories || [])].join(" ").toLowerCase();
}

function extractUserSignals() {
  const source = [...state.enrolledCourses, ...state.savedSkills];
  const signals = new Set();
  source.forEach((skill) => {
    skillSearchBlob(skill).split(/\s+/).forEach((token) => {
      if (token.length >= 3) signals.add(token);
    });
  });
  return signals;
}

function recordRecommendationSnapshot(summary, recommendations) {
  if (!Array.isArray(recommendations) || recommendations.length === 0) return;
  const entry = {
    createdAt: escapeHTML(new Date().toLocaleString()),
    summary: escapeHTML(summary || "AI recommendation run"),
    recommendations: recommendations.slice(0, 6).map((item) => ({
      id: item.id,
      title: escapeHTML(item.title),
      match: clampNumber(item.match, 0, 100, 80)
    }))
  };
  state.recommendationHistory.push(entry);
  if (state.recommendationHistory.length > 20) {
    state.recommendationHistory = state.recommendationHistory.slice(-20);
  }
  scheduleProfileSync();
}

// ─── SKILL DATABASE ──────────────────────────────────
const SKILLS = [
  {id:1,title:"Python for Data Science",desc:"Master Python fundamentals, NumPy, Pandas, and Matplotlib. The foundation of almost every modern technical career.",icon:"??",iconBg:"#D4EDE8",tags:["Programming","Data","Automation"],match:97,matchClass:"match-high",duration:"10 weeks",durationWks:10,difficulty:2,level:"beginner",categories:["tech","data"],salary:"INR 8-18 LPA",jobCount:"12,400+ openings"},
  {id:2,title:"UX Research & Strategy",desc:"Conduct user interviews, analyze findings, and translate insights into product decisions that ship.",icon:"??",iconBg:"#EAE5F5",tags:["Design","Research","Strategy"],match:93,matchClass:"match-high",duration:"8 weeks",durationWks:8,difficulty:2,level:"beginner",categories:["design"],salary:"INR 7-16 LPA",jobCount:"4,200+ openings"},
  {id:3,title:"SQL for Analytics",desc:"From basic SELECT to advanced window functions. Become the go-to analyst in any team.",icon:"??",iconBg:"#F5E9D3",tags:["Data","Analytics","Databases"],match:91,matchClass:"match-high",duration:"6 weeks",durationWks:6,difficulty:1,level:"beginner",categories:["data"],salary:"INR 6-14 LPA",jobCount:"9,800+ openings"},
  {id:4,title:"Product Management Fundamentals",desc:"Roadmaps, PRDs, stakeholder alignment, and prioritization frameworks used at top tech companies.",icon:"???",iconBg:"#F5E0E1",tags:["Business","Tech","Leadership"],match:88,matchClass:"match-mid",duration:"14 weeks",durationWks:14,difficulty:3,level:"intermediate",categories:["business","tech"],salary:"INR 15-35 LPA",jobCount:"3,100+ openings"},
  {id:5,title:"Figma & UI Design",desc:"Build polished interfaces with components, auto-layout, prototyping, and design systems from scratch.",icon:"??",iconBg:"#EAE5F5",tags:["Design","UI","Prototyping"],match:85,matchClass:"match-mid",duration:"10 weeks",durationWks:10,difficulty:2,level:"beginner",categories:["design"],salary:"INR 6-14 LPA",jobCount:"5,600+ openings"},
  {id:6,title:"Machine Learning Essentials",desc:"Supervised learning, model evaluation, and feature engineering. No PhD required - just Python and curiosity.",icon:"??",iconBg:"#D4EDE8",tags:["AI","Data","Programming"],match:82,matchClass:"match-mid",duration:"18 weeks",durationWks:18,difficulty:4,level:"intermediate",categories:["tech","data"],salary:"INR 12-28 LPA",jobCount:"7,300+ openings"},
  {id:7,title:"Content Strategy & SEO",desc:"Create content that ranks, converts, and builds authority. Covers keyword research, on-page SEO, and editorial planning.",icon:"??",iconBg:"#F5E9D3",tags:["Marketing","Writing","SEO"],match:79,matchClass:"match-mid",duration:"8 weeks",durationWks:8,difficulty:2,level:"beginner",categories:["marketing","creative"],salary:"INR 5-12 LPA",jobCount:"6,500+ openings"},
  {id:8,title:"Financial Modelling",desc:"Excel and Python models for forecasting, valuation, and scenario planning. Trusted in finance, consulting, and SaaS.",icon:"??",iconBg:"#F5E9D3",tags:["Finance","Excel","Analysis"],match:74,matchClass:"match-mid",duration:"12 weeks",durationWks:12,difficulty:3,level:"intermediate",categories:["business","data"],salary:"INR 10-22 LPA",jobCount:"2,800+ openings"},
  {id:9,title:"React & Modern JavaScript",desc:"Build fast, interactive web apps with React, hooks, and the modern JS ecosystem.",icon:"??",iconBg:"#EAE5F5",tags:["Programming","Frontend","Web"],match:88,matchClass:"match-mid",duration:"12 weeks",durationWks:12,difficulty:3,level:"intermediate",categories:["tech"],salary:"INR 9-20 LPA",jobCount:"14,200+ openings"},
  {id:10,title:"Email Marketing & Automation",desc:"Build automated sequences, segment audiences, and write emails that convert at scale.",icon:"??",iconBg:"#F5E0E1",tags:["Marketing","Automation","CRM"],match:72,matchClass:"match-mid",duration:"6 weeks",durationWks:6,difficulty:1,level:"beginner",categories:["marketing"],salary:"INR 4-10 LPA",jobCount:"3,900+ openings"},
  {id:11,title:"Data Visualisation with Tableau",desc:"Transform raw data into compelling dashboards and visual stories that drive decisions.",icon:"??",iconBg:"#D4EDE8",tags:["Data","BI","Visualisation"],match:80,matchClass:"match-mid",duration:"8 weeks",durationWks:8,difficulty:2,level:"beginner",categories:["data"],salary:"INR 7-15 LPA",jobCount:"4,700+ openings"},
  {id:12,title:"Prompt Engineering & AI Tools",desc:"Master the art of communicating with AI systems and building AI-powered workflows.",icon:"??",iconBg:"#F5E9D3",tags:["AI","Productivity","Automation"],match:90,matchClass:"match-high",duration:"4 weeks",durationWks:4,difficulty:1,level:"beginner",categories:["tech","creative"],salary:"INR 8-18 LPA",jobCount:"5,100+ openings",isNew:true},
  {id:13,title:"Node.js API Development",desc:"Build robust REST APIs with Express, middleware patterns, validation, and production error handling.",icon:"??",iconBg:"#D4EDE8",tags:["Backend","Node.js","APIs"],match:86,matchClass:"match-mid",duration:"9 weeks",durationWks:9,difficulty:3,level:"beginner",categories:["tech"],salary:"INR 8-19 LPA",jobCount:"8,900+ openings"},
  {id:14,title:"DevOps & CI/CD Fundamentals",desc:"Learn GitHub Actions, Docker basics, deployment pipelines, monitoring, and release workflows.",icon:"??",iconBg:"#F5E9D3",tags:["DevOps","CI/CD","Cloud"],match:83,matchClass:"match-mid",duration:"10 weeks",durationWks:10,difficulty:3,level:"intermediate",categories:["tech","business"],salary:"INR 10-24 LPA",jobCount:"6,800+ openings"},
  {id:15,title:"Cybersecurity Essentials",desc:"Understand threat models, secure coding, authentication, web vulnerabilities, and incident response basics.",icon:"??",iconBg:"#F5E0E1",tags:["Security","Networking","Risk"],match:81,matchClass:"match-mid",duration:"11 weeks",durationWks:11,difficulty:3,level:"beginner",categories:["tech"],salary:"INR 9-22 LPA",jobCount:"5,900+ openings"},
  {id:16,title:"Power BI for Business Analytics",desc:"Create interactive reports, DAX measures, and executive dashboards for operational decision-making.",icon:"??",iconBg:"#D4EDE8",tags:["Data","BI","Reporting"],match:84,matchClass:"match-mid",duration:"7 weeks",durationWks:7,difficulty:2,level:"beginner",categories:["data","business"],salary:"INR 7-16 LPA",jobCount:"5,200+ openings"},
  {id:17,title:"UX Writing & Content Design",desc:"Craft product microcopy, onboarding flows, and voice systems that improve usability and conversion.",icon:"??",iconBg:"#EAE5F5",tags:["UX","Writing","Design"],match:78,matchClass:"match-mid",duration:"6 weeks",durationWks:6,difficulty:2,level:"beginner",categories:["design","creative"],salary:"INR 6-13 LPA",jobCount:"2,700+ openings"},
  {id:18,title:"No-Code Automation with Zapier",desc:"Automate workflows across tools using triggers, actions, webhooks, and process design.",icon:"?",iconBg:"#F5E9D3",tags:["Automation","No-Code","Operations"],match:76,matchClass:"match-mid",duration:"5 weeks",durationWks:5,difficulty:1,level:"beginner",categories:["business","marketing","tech"],salary:"INR 5-11 LPA",jobCount:"3,300+ openings"},
  {id:19,title:"Advanced Excel for Analysts",desc:"Master formulas, pivot modeling, Power Query, and automation techniques used in real analyst workflows.",icon:"??",iconBg:"#F5E9D3",tags:["Excel","Analysis","Data"],match:77,matchClass:"match-mid",duration:"6 weeks",durationWks:6,difficulty:2,level:"beginner",categories:["data","business"],salary:"INR 5-12 LPA",jobCount:"7,100+ openings"},
  {id:20,title:"AI Product Management",desc:"Plan and ship AI features with model selection, evaluation metrics, human feedback, and governance.",icon:"??",iconBg:"#EAE5F5",tags:["AI","Product","Strategy"],match:87,matchClass:"match-mid",duration:"9 weeks",durationWks:9,difficulty:3,level:"intermediate",categories:["business","tech","data"],salary:"INR 14-30 LPA",jobCount:"2,900+ openings",isNew:true},
  {id:21,title:"Cloud Architecture on AWS",desc:"Design scalable cloud systems with networking, storage, compute, and reliability best practices.",icon:"??",iconBg:"#D4EDE8",tags:["Cloud","AWS","Architecture"],match:82,matchClass:"match-mid",duration:"12 weeks",durationWks:12,difficulty:3,level:"intermediate",categories:["tech","business"],salary:"INR 12-28 LPA",jobCount:"4,300+ openings"},
  {id:22,title:"Flutter Mobile App Development",desc:"Build cross-platform mobile apps with Flutter, state management, and API integration.",icon:"??",iconBg:"#EAE5F5",tags:["Mobile","Flutter","Frontend"],match:84,matchClass:"match-mid",duration:"10 weeks",durationWks:10,difficulty:3,level:"beginner",categories:["tech","creative"],salary:"INR 8-18 LPA",jobCount:"4,900+ openings"},
  {id:23,title:"Data Engineering with Airflow",desc:"Build reliable data pipelines with orchestration, ETL design, and warehouse loading strategies.",icon:"???",iconBg:"#D4EDE8",tags:["Data","ETL","Airflow"],match:85,matchClass:"match-mid",duration:"11 weeks",durationWks:11,difficulty:4,level:"intermediate",categories:["data","tech"],salary:"INR 12-26 LPA",jobCount:"3,700+ openings"},
  {id:24,title:"Performance Marketing",desc:"Run high-ROI campaigns across search and social with budget optimization and attribution.",icon:"??",iconBg:"#F5E0E1",tags:["Marketing","Ads","Growth"],match:80,matchClass:"match-mid",duration:"8 weeks",durationWks:8,difficulty:2,level:"beginner",categories:["marketing","business"],salary:"INR 6-14 LPA",jobCount:"5,400+ openings"},
  {id:25,title:"QA Automation Testing",desc:"Automate functional testing with modern frameworks, CI pipelines, and test reporting.",icon:"?",iconBg:"#F5E9D3",tags:["Testing","QA","Automation"],match:79,matchClass:"match-mid",duration:"8 weeks",durationWks:8,difficulty:2,level:"beginner",categories:["tech"],salary:"INR 6-13 LPA",jobCount:"4,100+ openings"}
];

// ─── PATH DATA ────────────────────────────────────────
const PATHS = {
  ai:{title:"AI & Machine Learning",desc:"A structured journey from Python fundamentals to deploying real ML models in production.",steps:[{title:"Python Foundations",desc:"Variables, functions, data structures, OOP basics"},{title:"Data Manipulation",desc:"NumPy, Pandas, exploratory data analysis"},{title:"Machine Learning Basics",desc:"scikit-learn, supervised learning, model evaluation"},{title:"Deep Learning",desc:"Neural networks with PyTorch or TensorFlow"},{title:"Production ML",desc:"MLOps, APIs, deployment, monitoring"}]},
  design:{title:"Product Design",desc:"From design thinking to a polished Figma portfolio that gets you hired.",steps:[{title:"Design Thinking",desc:"User empathy, problem framing, ideation"},{title:"UX Research",desc:"Interviews, usability testing, affinity mapping"},{title:"Wireframing & IA",desc:"Low-fidelity flows, information architecture"},{title:"Figma Mastery",desc:"Components, auto-layout, design systems"},{title:"Portfolio & Job Prep",desc:"Case studies, interviews, take-home challenges"}]},
  data:{title:"Data Analytics",desc:"From spreadsheets to Python dashboards — become the analyst every team wants.",steps:[{title:"Excel & Sheets",desc:"Pivot tables, VLOOKUP, data cleaning"},{title:"SQL Fundamentals",desc:"Queries, joins, aggregations, subqueries"},{title:"Python for Data",desc:"Pandas, NumPy, Matplotlib, EDA workflows"},{title:"Data Visualisation",desc:"Tableau or Power BI, storytelling with data"},{title:"Analytics Projects",desc:"End-to-end case studies, dashboards, presentations"}]},
  marketing:{title:"Growth Marketing",desc:"Master the full funnel — from acquisition to retention.",steps:[{title:"Marketing Foundations",desc:"Positioning, ICP, funnel basics, metrics"},{title:"SEO & Content",desc:"Keyword strategy, on-page, link building"},{title:"Paid Acquisition",desc:"Google Ads, Meta Ads, bidding, creative testing"},{title:"Email & CRM",desc:"Sequences, segmentation, deliverability"},{title:"Growth Experiments",desc:"A/B testing, CRO, growth loops"}]},
  webdev:{title:"Full-Stack Web Dev",desc:"From HTML basics to full production web applications.",steps:[{title:"HTML & CSS",desc:"Semantic markup, layouts, responsive design"},{title:"JavaScript",desc:"DOM, events, async, ES6+"},{title:"React",desc:"Components, hooks, state management"},{title:"Node.js & APIs",desc:"Express, REST APIs, authentication"},{title:"Databases & Deploy",desc:"SQL/NoSQL, cloud deployment, CI/CD"}]},
  pm:{title:"Product Management",desc:"Think like a PM, ship like one — the complete toolkit.",steps:[{title:"Product Discovery",desc:"Customer interviews, problem validation, opportunity sizing"},{title:"Strategy & Vision",desc:"Product vision, OKRs, competitive analysis"},{title:"Roadmapping",desc:"Prioritisation frameworks, stakeholder alignment"},{title:"Execution",desc:"Agile/scrum, sprint planning, metrics"},{title:"Launch & Growth",desc:"GTM strategy, user onboarding, retention"}]},
};
