// ─── APP STATE ───────────────────────────────────────
const state = {
  user: null,
  authToken: "",
  savedSkills: [],
  enrolledCourses: [],
  activityLog: [],
  recommendationHistory: [],
  weeklyPlan: [],
  selectedGapRole: "data_analyst",
  quizAnswers: {},
  aiRecommendations: [],
  exploreMode: "skills",
  exploreFilter: 'all',
  exploreSearch: '',
  exploreSort: 'match',
  currentPath: null,
  currentLessonCourseId: null,
  currentCertificateCourseId: null,
  currentResourceCourseId: null,
  currentResourceLessonIndex: null,
  selectedResourceQuizOption: "",
  lessonCursorByCourse: {},
  milestoneByCourse: {},
  lessonChecks: {},
  isChatBusy: false,
  hasShownCloudSyncWarning: false,
};

const inferredLocalApiBase =
  window.location.protocol === "file:"
    ? "http://localhost:4000"
    : "";
const API_BASE_URL = (
  window.SKILL_RECOMMENDATION_API_BASE ||
  window.SKILLPATH_API_BASE ||
  inferredLocalApiBase
).replace(/\/$/, "");
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTH_TOKEN_KEY = "srs_auth_token";
let profileSyncTimer = null;
let profileSyncInFlight = false;
let profileSyncQueued = false;

function isValidEmail(email) {
  return EMAIL_REGEX.test(String(email || "").trim());
}

async function requestJSON(path, options = {}) {
  const headers = {
    ...(options.headers || {})
  };
  if (state.authToken) {
    headers.Authorization = `Bearer ${state.authToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });
  const text = await response.text();

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const error = new Error((data && data.error) || text || `Request failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return data || {};
}

async function postJSON(path, payload) {
  return requestJSON(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function getJSON(path) {
  return requestJSON(path, { method: "GET" });
}

function clampNumber(value, min, max, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num < min) return min;
  if (num > max) return max;
  return num;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setAuthToken(token) {
  state.authToken = String(token || "");
  if (state.authToken) {
    localStorage.setItem(AUTH_TOKEN_KEY, state.authToken);
    return;
  }
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

async function bootstrapSession() {
  const existingToken = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!existingToken) {
    renderNavGuest();
    return;
  }

  setAuthToken(existingToken);
  try {
    const data = await getJSON("/api/users/profile/me");
    if (!data.profile) {
      throw new Error("Missing profile");
    }
    state.user = {
      name: String(data.profile.name || "").trim(),
      email: String(data.profile.email || "").trim().toLowerCase()
    };
    applyProfile(data.profile);
    renderNavUser();
  } catch (_error) {
    setAuthToken("");
    state.user = null;
    renderNavGuest();
  }
}

function renderNavGuest() {
  document.getElementById('nav-right').innerHTML = `
    <button class="btn-ghost" onclick="openAuth('login')">Sign in</button>
    <button class="btn-dark" onclick="openAuth('signup')">Get started</button>
  `;
}

function renderNavUser() {
  if (!state.user) return;
  const initials = state.user.name.split(' ').filter(Boolean).map(w=>w[0]).join('').toUpperCase().slice(0,2) || "U";
  document.getElementById('nav-right').innerHTML = `
    <div class="user-avatar" onclick="showPage('dashboard')" title="Dashboard">${escapeHTML(initials)}</div>
  `;
}

function buildEnrolledCourse(skillId, source = {}) {
  const skill = SKILLS.find((item) => item.id === Number(skillId));
  if (!skill) return null;
  return {
    ...skill,
    progress: clampNumber(source.progress, 0, 100, 0),
    enrolledAt: source.enrolledAt || new Date().toLocaleString()
  };
}

function getMilestone(progress) {
  const pct = clampNumber(progress, 0, 100, 0);
  if (pct >= 100) return 100;
  if (pct >= 75) return 75;
  if (pct >= 50) return 50;
  if (pct >= 25) return 25;
  return 0;
}

function maybeTriggerMilestone(course, prevProgress, nextProgress) {
  const prevMilestone = Math.max(getMilestone(prevProgress), Number(state.milestoneByCourse[course.id] || 0));
  const nextMilestone = getMilestone(nextProgress);
  if (nextMilestone > prevMilestone) {
    state.milestoneByCourse[course.id] = nextMilestone;
    const label = nextMilestone === 100 ? "Course complete" : `${nextMilestone}% checkpoint`;
    addActivity(`${label} reached for "${course.title}"`);
    showToast(`${course.title}: ${label}!`, "success");
  }
}

function buildCourseLessons(course) {
  const tags = Array.isArray(course.tags) ? course.tags : [];
  const primaryTag = tags[0] || "Core skill";
  return [
    { key: "foundations", title: `${course.title} foundations`, detail: `Build core understanding of ${primaryTag.toLowerCase()} and prerequisites.` },
    { key: "concepts", title: `Core concepts and workflows`, detail: `Learn practical patterns and real-world workflows used in teams.` },
    { key: "practice", title: `Guided practice session`, detail: `Apply concepts in a hands-on task with measurable output.` },
    { key: "project", title: `Mini project build`, detail: `Create a small portfolio-grade deliverable for this course.` },
    { key: "review", title: `Checkpoint review and reflection`, detail: `Consolidate learning and plan the next milestone.` }
  ];
}

function getLessonStateKey(courseId, lessonIndex) {
  return `${Number(courseId)}:${Number(lessonIndex)}`;
}

function getLessonCheck(courseId, lessonIndex) {
  const key = getLessonStateKey(courseId, lessonIndex);
  if (!state.lessonChecks[key]) {
    state.lessonChecks[key] = {
      scrolledToEnd: false,
      quizPassed: false,
      quizAnswer: ""
    };
  }
  return state.lessonChecks[key];
}

function isLessonUnlocked(courseId, lessonIndex) {
  const cursor = clampNumber(state.lessonCursorByCourse[courseId] || 0, 0, 999, 0);
  return lessonIndex <= cursor;
}

function getLessonQuiz(course, lesson) {
  const tags = Array.isArray(course.tags) ? course.tags : [];
  const primaryTag = (tags[0] || "core concepts").toLowerCase();
  const secondaryTag = (tags[1] || "hands-on practice").toLowerCase();
  const quizByLesson = {
    foundations: {
      question: `Which first step is best for ${course.title} foundations?`,
      options: [
        { id: "a", text: `Review ${primaryTag} basics and key vocabulary`, correct: true },
        { id: "b", text: "Skip basics and jump to advanced interview problems", correct: false },
        { id: "c", text: "Memorize definitions without practice", correct: false }
      ]
    },
    concepts: {
      question: `What helps most while learning ${lesson.title.toLowerCase()}?`,
      options: [
        { id: "a", text: "Map concepts to one real workflow in your target role", correct: true },
        { id: "b", text: "Read only theory and avoid examples", correct: false },
        { id: "c", text: "Switch topics every 10 minutes", correct: false }
      ]
    },
    practice: {
      question: "How should you run a guided practice session?",
      options: [
        { id: "a", text: `Do one timed task focused on ${secondaryTag}`, correct: true },
        { id: "b", text: "Watch videos passively without building anything", correct: false },
        { id: "c", text: "Copy code line by line without understanding", correct: false }
      ]
    },
    project: {
      question: "What makes a mini project portfolio-ready?",
      options: [
        { id: "a", text: "Clear goal, usable output, and short write-up of decisions", correct: true },
        { id: "b", text: "No explanation, no README, and no real use-case", correct: false },
        { id: "c", text: "Only screenshots without working steps", correct: false }
      ]
    },
    review: {
      question: "What is the best final checkpoint action?",
      options: [
        { id: "a", text: "Reflect on weak areas and schedule the next milestone", correct: true },
        { id: "b", text: "Restart from lesson 1 regardless of progress", correct: false },
        { id: "c", text: "Stop learning after one completion", correct: false }
      ]
    }
  };
  return quizByLesson[lesson.key] || quizByLesson.foundations;
}

function buildLessonResource(course, lesson, lessonIndex) {
  const lessonNumber = lessonIndex + 1;
  const tags = Array.isArray(course.tags) ? course.tags : [];
  const primaryTag = tags[0] || "core concepts";
  const secondaryTag = tags[1] || "applied practice";
  return {
    title: `${course.title}: Lesson ${lessonNumber} Resource`,
    subtitle: lesson.title,
    sections: [
      {
        heading: "What You Will Learn",
        body: `This lesson focuses on ${lesson.title.toLowerCase()}. Your objective is to connect ${primaryTag.toLowerCase()} with practical use in a real role.`
      },
      {
        heading: "How To Practice",
        body: `Study the explanation, then do a short practice block. Use one simple exercise to apply ${secondaryTag.toLowerCase()} and note where you get stuck.`
      },
      {
        heading: "Real-World Connection",
        body: "Think about where this appears in day-to-day work. Build one small example that could be shown in a portfolio, interview, or peer review."
      },
      {
        heading: "Completion Checklist",
        body: "Read this resource till the end, then pass the topic quiz. Only after both are done, your lesson progress will move forward."
      }
    ],
    quiz: getLessonQuiz(course, lesson)
  };
}

function updateLessonCompleteButtonState(course) {
  const completeBtn = document.getElementById("lesson-complete-btn");
  if (!completeBtn || !course) return;
  const lessons = buildCourseLessons(course);
  const cursor = clampNumber(state.lessonCursorByCourse[course.id] || 0, 0, lessons.length, 0);
  if (cursor >= lessons.length) {
    completeBtn.textContent = "All Lessons Completed";
    completeBtn.disabled = true;
    return;
  }
  const check = getLessonCheck(course.id, cursor);
  if (check.scrolledToEnd && check.quizPassed) {
    completeBtn.textContent = "Complete Current Lesson";
    completeBtn.disabled = false;
    return;
  }
  completeBtn.textContent = "Complete Current Lesson (Locked)";
  completeBtn.disabled = true;
}

function renderLessonModal(course) {
  const lessons = buildCourseLessons(course);
  const cursor = clampNumber(state.lessonCursorByCourse[course.id] || 0, 0, lessons.length, 0);
  const completedCount = Math.min(cursor, lessons.length);

  document.getElementById("lesson-modal-title").textContent = `${course.title} Lessons`;
  document.getElementById("lesson-modal-summary").textContent = `Completed ${completedCount}/${lessons.length} lessons. Open current topic, scroll to the end, and pass quiz to unlock completion.`;
  document.getElementById("lesson-modal-list").innerHTML = lessons
    .map((lesson, index) => {
      const done = index < cursor;
      const active = index === cursor && cursor < lessons.length;
      const unlocked = isLessonUnlocked(course.id, index);
      const status = done ? "Done" : active ? "Current" : "Upcoming";
      const check = getLessonCheck(course.id, index);
      const gateLabel = done
        ? "Resource + quiz done"
        : check.scrolledToEnd && check.quizPassed
          ? "Ready to complete"
          : "Open resource";
      const actionBtn = unlocked
        ? `<button onclick="openLessonResource(${course.id},${index})">${done ? "Review" : "Learn"}</button>`
        : `<button disabled style="opacity:.55;cursor:not-allowed;background:var(--ink-mute)">Locked</button>`;
      return `
        <div class="planner-item ${done ? "done" : ""}">
          <div>
            <strong>${escapeHTML(lesson.title)}</strong>
            <span>${escapeHTML(lesson.detail)} - ${status} - ${gateLabel}</span>
          </div>
          ${actionBtn}
        </div>
      `;
    })
    .join("");

  updateLessonCompleteButtonState(course);
}

function closeLessonModal(e) {
  const modal = document.getElementById("lesson-modal");
  if (!modal) return;
  if (!e || e.target === modal) modal.classList.remove("open");
}

function openLessonResource(courseId, lessonIndex) {
  const course = state.enrolledCourses.find((item) => item.id === Number(courseId));
  if (!course) return;

  const lessons = buildCourseLessons(course);
  const safeIndex = clampNumber(lessonIndex, 0, lessons.length - 1, 0);
  if (!isLessonUnlocked(course.id, safeIndex)) {
    showToast("Complete the current lesson to unlock this topic.", "error");
    return;
  }

  const lesson = lessons[safeIndex];
  const resource = buildLessonResource(course, lesson, safeIndex);
  const check = getLessonCheck(course.id, safeIndex);
  state.currentResourceCourseId = course.id;
  state.currentResourceLessonIndex = safeIndex;
  state.selectedResourceQuizOption = String(check.quizAnswer || "");

  document.getElementById("resource-modal-title").textContent = resource.title;
  document.getElementById("resource-modal-subtitle").textContent = resource.subtitle;
  document.getElementById("resource-content").innerHTML = resource.sections
    .map(
      (section) => `
      <section style="margin-bottom:1.1rem">
        <h3 style="font-size:.95rem;margin-bottom:.35rem">${escapeHTML(section.heading)}</h3>
        <p style="font-size:.84rem;color:var(--ink-soft);line-height:1.7">${escapeHTML(section.body)}</p>
      </section>
    `
    )
    .join("");

  document.getElementById("resource-quiz-question").textContent = resource.quiz.question;
  document.getElementById("resource-quiz-options").innerHTML = resource.quiz.options
    .map((option) => {
      const selected = option.id === state.selectedResourceQuizOption ? "selected" : "";
      return `<button class="option-btn ${selected}" style="width:100%" onclick="selectResourceQuizOption('${option.id}')">${escapeHTML(option.text)}</button>`;
    })
    .join("");

  const scrollBox = document.getElementById("resource-scrollbox");
  if (scrollBox) {
    scrollBox.scrollTop = 0;
  }

  const scrollStatus = document.getElementById("resource-scroll-status");
  if (scrollStatus) {
    scrollStatus.textContent = check.scrolledToEnd
      ? "Scroll complete. Quiz is now unlocked."
      : "Read and scroll till the end to unlock quiz submission.";
  }

  document.getElementById("resource-quiz-submit").disabled = !check.scrolledToEnd;
  document.getElementById("resource-quiz-feedback").textContent = "";
  document.getElementById("resource-modal").classList.add("open");
}

function closeResourceModal(e) {
  const modal = document.getElementById("resource-modal");
  if (!modal) return;
  if (!e || e.target === modal) {
    modal.classList.remove("open");
  }
}

function handleResourceScroll() {
  if (state.currentResourceCourseId === null || state.currentResourceLessonIndex === null) return;
  const scrollBox = document.getElementById("resource-scrollbox");
  if (!scrollBox) return;
  const threshold = 6;
  const reachedEnd = scrollBox.scrollTop + scrollBox.clientHeight >= scrollBox.scrollHeight - threshold;
  if (!reachedEnd) return;

  const check = getLessonCheck(state.currentResourceCourseId, state.currentResourceLessonIndex);
  if (!check.scrolledToEnd) {
    check.scrolledToEnd = true;
    document.getElementById("resource-scroll-status").textContent = "Scroll complete. Submit the quiz to finish this topic.";
    document.getElementById("resource-quiz-submit").disabled = false;
    showToast("Great. Scroll completed. Now submit the quiz.", "success");
    scheduleProfileSync();
  }
}

function selectResourceQuizOption(optionId) {
  state.selectedResourceQuizOption = optionId;
  const optionsWrap = document.getElementById("resource-quiz-options");
  if (!optionsWrap) return;
  optionsWrap.querySelectorAll(".option-btn").forEach((btn) => btn.classList.remove("selected"));
  const selectedBtn = [...optionsWrap.querySelectorAll(".option-btn")].find((btn) =>
    btn.getAttribute("onclick") === `selectResourceQuizOption('${optionId}')`
  );
  if (selectedBtn) selectedBtn.classList.add("selected");
}

function submitResourceQuiz() {
  if (state.currentResourceCourseId === null || state.currentResourceLessonIndex === null) return;
  const course = state.enrolledCourses.find((item) => item.id === state.currentResourceCourseId);
  if (!course) return;

  const lessons = buildCourseLessons(course);
  const lesson = lessons[state.currentResourceLessonIndex];
  if (!lesson) return;
  const check = getLessonCheck(course.id, state.currentResourceLessonIndex);
  const feedbackEl = document.getElementById("resource-quiz-feedback");

  if (!check.scrolledToEnd) {
    feedbackEl.textContent = "Please read the resource and scroll to the end first.";
    feedbackEl.style.color = "var(--rose-dark)";
    return;
  }
  if (!state.selectedResourceQuizOption) {
    feedbackEl.textContent = "Please select an answer.";
    feedbackEl.style.color = "var(--rose-dark)";
    return;
  }

  const quiz = getLessonQuiz(course, lesson);
  const selected = quiz.options.find((option) => option.id === state.selectedResourceQuizOption);
  check.quizAnswer = state.selectedResourceQuizOption;
  if (selected && selected.correct) {
    check.quizPassed = true;
    feedbackEl.textContent = "Correct. Topic unlocked. You can now complete this lesson.";
    feedbackEl.style.color = "var(--teal-dark)";
    renderLessonModal(course);
    updateLessonCompleteButtonState(course);
    scheduleProfileSync();
    return;
  }

  check.quizPassed = false;
  feedbackEl.textContent = "Not quite. Re-read the topic and try again.";
  feedbackEl.style.color = "var(--rose-dark)";
  renderLessonModal(course);
}

function completeCurrentLesson() {
  if (!state.user || state.currentLessonCourseId === null) return;
  const course = state.enrolledCourses.find((item) => item.id === state.currentLessonCourseId);
  if (!course) return;

  const lessons = buildCourseLessons(course);
  const cursor = clampNumber(state.lessonCursorByCourse[course.id] || 0, 0, lessons.length, 0);
  if (cursor >= lessons.length) return;
  const check = getLessonCheck(course.id, cursor);
  if (!check.scrolledToEnd || !check.quizPassed) {
    showToast("Open current lesson, finish scroll, and pass quiz first.", "error");
    return;
  }

  const prevProgress = clampNumber(course.progress, 0, 100, 0);
  const progressDelta = Math.max(4, Math.round(100 / lessons.length));
  const nextProgress = Math.min(100, prevProgress + progressDelta);
  course.progress = nextProgress;
  state.lessonCursorByCourse[course.id] = cursor + 1;
  getLessonCheck(course.id, cursor + 1);
  maybeTriggerMilestone(course, prevProgress, nextProgress);
  addActivity(`Completed lesson ${cursor + 1}/${lessons.length} in "${course.title}"`);

  renderLessonModal(course);
  renderDashboard();
  scheduleProfileSync();
}
function applyProfile(profile) {
  if (!profile || typeof profile !== "object") return;

  if (state.user) {
    state.user.name = (profile.name || state.user.name || "").trim();
  }

  if (profile.quizAnswers && typeof profile.quizAnswers === "object") {
    state.quizAnswers = { ...profile.quizAnswers };
  }

  const savedIds = Array.isArray(profile.savedSkills) ? profile.savedSkills : [];
  state.savedSkills = savedIds
    .map((id) => SKILLS.find((skill) => skill.id === Number(id)))
    .filter(Boolean);

  const rawEnrolled = Array.isArray(profile.enrolledCourses)
    ? profile.enrolledCourses
    : Array.isArray(profile.enrolledCourseIds)
      ? profile.enrolledCourseIds.map((id) => ({ id, progress: 0 }))
      : [];

  state.enrolledCourses = rawEnrolled
    .map((item) => buildEnrolledCourse(item.id, item))
    .filter(Boolean);
  state.lessonChecks = {};
  state.lessonCursorByCourse = {};
  state.milestoneByCourse = {};
  state.enrolledCourses.forEach((course) => {
    const pct = clampNumber(course.progress, 0, 100, 0);
    state.milestoneByCourse[course.id] = getMilestone(pct);
    state.lessonCursorByCourse[course.id] = Math.min(5, Math.floor(pct / 20));
    for (let index = 0; index < state.lessonCursorByCourse[course.id]; index += 1) {
      const check = getLessonCheck(course.id, index);
      check.scrolledToEnd = true;
      check.quizPassed = true;
    }
  });

  state.activityLog = Array.isArray(profile.activityLog)
    ? profile.activityLog
        .filter((item) => item && typeof item.text === "string")
        .map((item) => ({
          text: escapeHTML(item.text),
          time: escapeHTML(item.time || new Date().toLocaleString())
        }))
        .slice(-200)
    : [];

  state.recommendationHistory = Array.isArray(profile.recommendationHistory)
    ? profile.recommendationHistory
        .filter((item) => item && Array.isArray(item.recommendations))
        .map((item) => ({
          createdAt: escapeHTML(item.createdAt || new Date().toLocaleString()),
          summary: escapeHTML(item.summary || "AI recommendation run"),
          recommendations: item.recommendations
            .filter((rec) => rec && typeof rec.id === "number")
            .map((rec) => ({
              id: rec.id,
              title: escapeHTML(rec.title || SKILLS.find((skill) => skill.id === rec.id)?.title || `Skill ${rec.id}`),
              match: clampNumber(rec.match, 0, 100, 80)
            }))
            .slice(0, 6)
        }))
        .slice(-20)
    : [];
}

function buildProfilePayload() {
  if (!state.user) return null;

  return {
    name: state.user.name,
    quizAnswers: state.quizAnswers,
    savedSkills: state.savedSkills.map((skill) => skill.id),
    enrolledCourses: state.enrolledCourses.map((course) => ({
      id: course.id,
      progress: clampNumber(course.progress, 0, 100, 0),
      enrolledAt: course.enrolledAt || ""
    })),
    activityLog: state.activityLog.slice(-200),
    recommendationHistory: state.recommendationHistory.slice(-20)
  };
}

async function loadProfileForCurrentUser() {
  if (!state.user?.email || !state.authToken) return;

  try {
    const data = await getJSON("/api/users/profile/me");
    if (data.profile) {
      applyProfile(data.profile);
    }
  } catch (error) {
    if (error.status === 401) {
      showToast("Session expired. Please sign in again.", "error");
      await doLogout(true, true);
      return;
    }
    if (error.status === 404) {
      return;
    }
    if (error.status === 503 && !state.hasShownCloudSyncWarning) {
      showToast("Cloud profile sync is offline. Using local session only.", "error");
      state.hasShownCloudSyncWarning = true;
      return;
    }
    console.warn("Profile load failed:", error.message);
  }
}

async function syncProfileNow(silent = false) {
  if (!state.user || !state.authToken) return;
  const payload = buildProfilePayload();
  if (!payload) return;

  if (profileSyncInFlight) {
    profileSyncQueued = true;
    return;
  }

  profileSyncInFlight = true;
  try {
    await postJSON("/api/users/profile", payload);
  } catch (error) {
    if (error.status === 401) {
      if (!silent) showToast("Session expired. Please sign in again.", "error");
      await doLogout(true, true);
      return;
    }
    if (error.status === 503) {
      if (!state.hasShownCloudSyncWarning && !silent) {
        showToast("Cloud profile sync is offline. Changes are temporary.", "error");
        state.hasShownCloudSyncWarning = true;
      }
    } else if (!silent) {
      showToast("Could not sync profile to cloud.", "error");
    }
    console.warn("Profile sync failed:", error.message);
  } finally {
    profileSyncInFlight = false;
    if (profileSyncQueued) {
      profileSyncQueued = false;
      syncProfileNow(true);
    }
  }
}

function scheduleProfileSync(delay = 600) {
  if (!state.user) return;
  clearTimeout(profileSyncTimer);
  profileSyncTimer = setTimeout(() => {
    syncProfileNow(true);
  }, delay);
}

// Core catalog constants are in js/data.js

// ─── PAGE ROUTING ─────────────────────────────────────
function showPage(id) {
  const target = document.getElementById('page-' + id);
  if (!target) return;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  target.classList.add('active');
  window.scrollTo({top:0,behavior:'smooth'});
  if (id === 'explore') renderExplore();
  if (id === 'dashboard') renderDashboard();
}

function requireAuth(page) {
  if (!state.user) { openAuth('login'); return; }
  showPage(page);
}

// ─── AUTH ─────────────────────────────────────────────
function openAuth(mode) {
  switchAuth(mode);
  document.getElementById('auth-overlay').classList.add('open');
}
function closeAuth() { document.getElementById('auth-overlay').classList.remove('open'); }
function switchAuth(mode) {
  document.querySelectorAll('.auth-tab').forEach((t,i) => t.classList.toggle('active', (i===0&&mode==='login')||(i===1&&mode==='signup')));
  document.getElementById('auth-login').style.display = mode==='login'?'block':'none';
  document.getElementById('auth-signup').style.display = mode==='signup'?'block':'none';
}
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pw = document.getElementById('login-pw').value;
  if (!email || !pw) { showToast('Please fill in all fields','error'); return; }
  if (!isValidEmail(email)) { showToast('Please enter a valid email','error'); return; }
  try {
    const auth = await postJSON("/api/auth/login", { email, password: pw });
    await loginUser(auth, false);
    closeAuth();
  } catch (error) {
    const msg = /failed to fetch/i.test(String(error.message || ""))
      ? "Cannot reach backend. Start backend on port 4000 and check CORS_ORIGIN."
      : error.message || "Sign in failed.";
    showToast(msg, "error");
  }
}
async function doSignup() {
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pw = document.getElementById('signup-pw').value;
  if (!name || !email || !pw) { showToast('Please fill in all fields','error'); return; }
  if (!isValidEmail(email)) { showToast('Please enter a valid email','error'); return; }
  try {
    const auth = await postJSON("/api/auth/signup", { name, email, password: pw });
    await loginUser(auth, true);
    closeAuth();
  } catch (error) {
    const msg = /failed to fetch/i.test(String(error.message || ""))
      ? "Cannot reach backend. Start backend on port 4000 and check CORS_ORIGIN."
      : error.message || "Account creation failed.";
    showToast(msg, "error");
  }
}
async function loginUser(authPayload, isSignup = false) {
  const token = String(authPayload?.token || "");
  const user = authPayload?.user || {};
  if (!token || !user?.email) {
    showToast("Authentication response was invalid.", "error");
    return;
  }

  setAuthToken(token);
  state.user = {
    name: String(user.name || "").trim(),
    email: String(user.email || "").trim().toLowerCase()
  };
  renderNavUser();
  await loadProfileForCurrentUser();
  if (isSignup) addActivity(`Created account and joined Skill Recommendation System`);
  addActivity(`Signed in to Skill Recommendation System`);
  scheduleProfileSync();
  renderExplore();
  if (state.aiRecommendations.length) renderAIResults(state.aiRecommendations);
  if (document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
  showToast(`Welcome back, ${(state.user.name.split(' ')[0] || 'there')}!`,'success');
}
async function doLogout(silent = false, skipSync = false) {
  if (!skipSync) {
    await syncProfileNow(true);
  }
  clearTimeout(profileSyncTimer);
  setAuthToken("");
  state.user = null;
  state.savedSkills = [];
  state.enrolledCourses = [];
  state.activityLog = [];
  state.recommendationHistory = [];
  state.weeklyPlan = [];
  state.currentLessonCourseId = null;
  state.currentCertificateCourseId = null;
  state.currentResourceCourseId = null;
  state.currentResourceLessonIndex = null;
  state.selectedResourceQuizOption = "";
  state.lessonCursorByCourse = {};
  state.milestoneByCourse = {};
  state.lessonChecks = {};
  state.selectedGapRole = "data_analyst";
  state.quizAnswers = {};
  state.aiRecommendations = [];
  state.hasShownCloudSyncWarning = false;
  renderNavGuest();
  if (!silent) showToast('Signed out successfully');
  showPage('home');
}

// ─── QUIZ ─────────────────────────────────────────────
function selectOption(btn, stepIdx, key, value) {
  btn.closest('.options-grid').querySelectorAll('.option-btn').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
  state.quizAnswers[key] = value;
  document.getElementById('next-' + stepIdx).disabled = false;
  scheduleProfileSync();
}
function nextStep(to) {
  document.getElementById('step-'+(to-1)).classList.remove('active');
  document.getElementById('step-'+to).classList.add('active');
  for(let i=0;i<4;i++) {
    const d = document.getElementById('dot-'+i);
    d.className = 'progress-dot' + (i<to?' done':i===to?' active':'');
  }
  document.getElementById('quiz-card').scrollIntoView({behavior:'smooth',block:'center'});
}

function scoreSkillForQuiz(skill, answers) {
  const field = String(answers?.field || "").toLowerCase();
  const time = String(answers?.time || "").toLowerCase();
  const level = String(answers?.level || "").toLowerCase();
  const goal = String(answers?.goal || "").toLowerCase();
  let score = Number(skill.match || 70);

  if (Array.isArray(skill.categories)) {
    if (field.includes("tech") && skill.categories.includes("tech")) score += 10;
    if ((field.includes("data") || field.includes("analytics")) && skill.categories.includes("data")) score += 10;
    if ((field.includes("design") || field.includes("ux")) && skill.categories.includes("design")) score += 10;
    if ((field.includes("marketing") || field.includes("growth")) && skill.categories.includes("marketing")) score += 10;
    if ((field.includes("business") || field.includes("strategy")) && skill.categories.includes("business")) score += 10;
    if ((field.includes("content") || field.includes("writing")) && skill.categories.includes("creative")) score += 8;
  }

  if (level.includes("beginner") || level.includes("some")) {
    score += skill.level === "beginner" ? 8 : -2;
  } else if (level.includes("intermediate") || level.includes("advanced")) {
    score += skill.level === "intermediate" ? 8 : 1;
  }

  if (time.includes("1") && time.includes("3")) score += skill.durationWks <= 6 ? 7 : -2;
  if (time.includes("4") && time.includes("8")) score += skill.durationWks >= 6 && skill.durationWks <= 12 ? 7 : 1;
  if (time.includes("8") && time.includes("15")) score += skill.durationWks >= 9 ? 7 : 2;
  if (time.includes("full-time")) score += skill.durationWks >= 10 ? 7 : 2;

  if (goal.includes("switch") || goal.includes("new career")) score += skill.level === "beginner" ? 5 : 1;
  if (goal.includes("promotion")) score += skill.level === "intermediate" ? 5 : 1;
  if (goal.includes("salary") || goal.includes("income")) score += /([2-9]\d)-/.test(skill.salary || "") ? 4 : 1;

  return clampNumber(Math.round(score), 60, 99, 70);
}

async function runAIRecommendation() {
  const requiredKeys = ["goal", "field", "time", "level"];
  const missing = requiredKeys.some((key) => !state.quizAnswers[key]);
  if (missing) {
    showToast("Please complete all quiz steps first.", "error");
    return;
  }

  // Show loading
  document.getElementById('step-3').classList.remove('active');
  document.getElementById('step-loading').classList.add('active');

  try {
    const parsed = await postJSON("/api/ai/recommendations", {
      quizAnswers: state.quizAnswers
    });
    if (!Array.isArray(parsed.recommendations) || parsed.recommendations.length === 0) {
      throw new Error("No recommendations returned.");
    }

    state.aiRecommendations = parsed.recommendations.map(r => {
      const skill = SKILLS.find(s=>s.id===r.id);
      if (!skill) return null;
      return {...skill, match:r.match, aiReason:escapeHTML(r.reason || ""),
        matchClass: r.match>=90?'match-high':r.match>=75?'match-mid':'match-low'};
    }).filter(Boolean);
    if (state.aiRecommendations.length === 0) throw new Error("No valid recommendations returned.");

    document.getElementById('ai-summary-text').textContent = parsed.summary || `Based on your answers, we've found ${state.aiRecommendations.length} skills matched to your goals.`;
    renderAIResults(state.aiRecommendations);
    recordRecommendationSnapshot(parsed.summary, state.aiRecommendations);
  } catch(e) {
    // Local intelligent fallback using the same quiz answers
    state.aiRecommendations = [...SKILLS]
      .map((skill) => ({
        ...skill,
        match: scoreSkillForQuiz(skill, state.quizAnswers),
        aiReason: "Recommended from your goal, field, time, and current level."
      }))
      .sort((a, b) => b.match - a.match)
      .slice(0, 6);
    document.getElementById('ai-summary-text').textContent = `Based on your answers, we've found ${state.aiRecommendations.length} skills matched to your goals.`;
    renderAIResults(state.aiRecommendations);
    recordRecommendationSnapshot(document.getElementById('ai-summary-text').textContent, state.aiRecommendations);
  }

  document.getElementById('step-loading').classList.remove('active');
  document.getElementById('ai-results-section').style.display = 'block';
  document.getElementById('ai-results-section').scrollIntoView({behavior:'smooth'});
  if (state.user) {
    addActivity(`Completed skill assessment — ${state.quizAnswers.field}`);
    scheduleProfileSync();
  }
}

function renderAIResults(skills) {
  const grid = document.getElementById('ai-results-grid');
  grid.innerHTML = skills.map(s => buildSkillCard(s, true)).join('');
}

function filterChip(el, type) {
  el.closest('.filter-chips').querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  let filtered = state.aiRecommendations;
  if (type==='beginner') filtered = filtered.filter(s=>s.level==='beginner');
  if (type==='intermediate') filtered = filtered.filter(s=>s.level==='intermediate');
  if (type==='high') filtered = filtered.filter(s=>s.match>=90);
  document.getElementById('ai-results-grid').innerHTML = filtered.map(s=>buildSkillCard(s,true)).join('');
}

function retakeQuiz() {
  state.quizAnswers = {};
  document.querySelectorAll('.quiz-step').forEach(s=>s.classList.remove('active'));
  document.getElementById('step-0').classList.add('active');
  document.getElementById('quiz-card').style.display = 'block';
  document.getElementById('ai-results-section').style.display = 'none';
  for(let i=0;i<4;i++) {
    const d=document.getElementById('dot-'+i);
    d.className='progress-dot'+(i===0?' active':'');
    document.getElementById('next-'+i).disabled = true;
  }
  document.querySelectorAll('.option-btn').forEach(b=>b.classList.remove('selected'));
  document.getElementById('quiz-card').scrollIntoView({behavior:'smooth'});
  scheduleProfileSync();
}

// EXPLORE
function renderExplore() {
  renderExploreHeaderState();
  if (state.exploreMode === "jobs") {
    renderExploreJobs();
    return;
  }
  renderExploreSkills();
}

function searchSkills(v) { state.exploreSearch=v; renderExplore(); }
function sortSkills() { state.exploreSort=document.getElementById('sort-select').value; renderExplore(); }
function filterExplore(el, type) {
  el.closest('.filter-chips').querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  state.exploreFilter = type;
  renderExplore();
}

function setExploreMode(mode, el) {
  state.exploreMode = mode === "jobs" ? "jobs" : "skills";
  if (el && el.closest(".filter-chips")) {
    el.closest(".filter-chips").querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    el.classList.add("active");
  }
  state.exploreSearch = "";
  const search = document.getElementById("explore-search");
  if (search) search.value = "";
  state.exploreSort = state.exploreMode === "jobs" ? "latest" : "match";
  renderExplore();
}

function renderExploreHeaderState() {
  const titleEl = document.getElementById("explore-title");
  const subEl = document.getElementById("explore-sub");
  const searchEl = document.getElementById("explore-search");
  const sortEl = document.getElementById("sort-select");
  const skillFilters = document.getElementById("explore-skill-filters");
  if (titleEl) {
    titleEl.textContent = state.exploreMode === "jobs" ? "Explore jobs" : "Explore all skills";
  }
  if (subEl) {
    subEl.textContent = state.exploreMode === "jobs"
      ? "Discover role openings with required skills for each company."
      : "Discover curated skills and enroll in your next learning path.";
  }
  if (searchEl) {
    searchEl.placeholder = state.exploreMode === "jobs"
      ? "Search role, company, location, skills..."
      : "Search skills, topics, tools...";
  }
  if (sortEl) {
    sortEl.innerHTML = state.exploreMode === "jobs"
      ? `<option value="latest">Sort: Latest</option>
         <option value="salary">Sort: Highest salary</option>
         <option value="company">Sort: Company A-Z</option>`
      : `<option value="match">Sort: Best match</option>
         <option value="alpha">Sort: A-Z</option>
         <option value="duration">Sort: Duration</option>
         <option value="difficulty">Sort: Easiest first</option>`;
    sortEl.value = state.exploreSort;
  }
  if (skillFilters) {
    skillFilters.style.display = state.exploreMode === "jobs" ? "none" : "flex";
  }
}

function renderExploreSkills() {
  let skills = [...SKILLS];
  if (state.exploreFilter !== 'all') skills = skills.filter(s=>s.categories.includes(state.exploreFilter));
  if (state.exploreSearch) {
    const q = state.exploreSearch.toLowerCase();
    skills = skills.filter((s) => {
      const blob = [
        s.title,
        s.desc,
        s.level,
        s.duration,
        ...(s.tags || []),
        ...(s.categories || [])
      ].join(" ").toLowerCase();
      return blob.includes(q);
    });
  }
  if (state.exploreSort==='alpha') skills.sort((a,b)=>a.title.localeCompare(b.title));
  else if (state.exploreSort==='duration') skills.sort((a,b)=>a.durationWks-b.durationWks);
  else if (state.exploreSort==='difficulty') skills.sort((a,b)=>a.difficulty-b.difficulty);
  else skills.sort((a,b)=>b.match-a.match);
  document.getElementById('explore-grid').innerHTML = skills.length
    ? skills.map(s=>buildSkillCard(s,false)).join('')
    : `<div class="empty-state" style="grid-column:1/-1"><div class="es-icon">Search</div><p>No skills match your search.</p></div>`;
}

function buildJobListings() {
  const locations = ["Bengaluru", "Hyderabad", "Chennai", "Pune", "Mumbai", "Delhi NCR", "Remote", "Kolkata"];
  const levels = ["0-2 yrs", "1-3 yrs", "2-4 yrs", "3-5 yrs"];
  const jobTypes = ["Full-time", "Hybrid", "Remote"];
  const jobs = [];
  SKILLS.forEach((skill, skillIndex) => {
    const mapping = getRoleCompanyMatch(skill);
    const companies = mapping.companies.slice(0, 4);
    companies.forEach((company, idx) => {
      const primarySkills = (skill.tags || []).slice(0, 3);
      const requiredSkills = [
        ...primarySkills,
        "Communication",
        idx % 2 === 0 ? "Problem Solving" : "Collaboration"
      ].slice(0, 5);
      jobs.push({
        id: `job-${skill.id}-${idx + 1}`,
        role: mapping.role,
        company,
        location: locations[(skillIndex + idx) % locations.length],
        level: levels[(skillIndex + idx) % levels.length],
        type: jobTypes[(skillIndex + idx) % jobTypes.length],
        salary: `INR ${6 + ((skillIndex + idx) % 10)}-${14 + ((skillIndex + idx) % 18)} LPA`,
        postedDaysAgo: 1 + ((skillIndex * 3 + idx) % 12),
        requiredSkills
      });
    });
  });
  return jobs.slice(0, 100);
}

const JOB_LISTINGS = buildJobListings();

function buildJobCard(job) {
  const tags = job.requiredSkills.map((item) => `<span class="tag">${escapeHTML(item)}</span>`).join("");
  return `
    <div class="skill-card">
      <div class="skill-card-top">
        <div class="skill-icon-wrap" style="background:var(--teal-light)">Job</div>
        <span class="match-badge match-high">${escapeHTML(job.type)}</span>
      </div>
      <h3>${escapeHTML(job.role)}</h3>
      <p>${escapeHTML(job.company)} - ${escapeHTML(job.location)} - ${escapeHTML(job.level)}</p>
      <div class="skill-tags">${tags}</div>
      <div class="skill-meta">
        <span>Salary: ${escapeHTML(job.salary)}</span>
        <span>${job.postedDaysAgo}d ago</span>
      </div>
      <button class="enroll-btn" onclick="openJobLearningPath('${escapeHTML(job.id)}')">Start learning</button>
    </div>
  `;
}

function renderExploreJobs() {
  let jobs = [...JOB_LISTINGS];
  if (state.exploreSearch) {
    const q = state.exploreSearch.toLowerCase();
    jobs = jobs.filter((job) =>
      [job.role, job.company, job.location, job.level, job.type, ...(job.requiredSkills || [])]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }
  if (state.exploreSort === "salary") {
    jobs.sort((a, b) => {
      const aMax = Number((a.salary.match(/-(\d+)/) || [0, 0])[1]);
      const bMax = Number((b.salary.match(/-(\d+)/) || [0, 0])[1]);
      return bMax - aMax;
    });
  } else if (state.exploreSort === "company") {
    jobs.sort((a, b) => a.company.localeCompare(b.company));
  } else {
    jobs.sort((a, b) => a.postedDaysAgo - b.postedDaysAgo);
  }
  document.getElementById("explore-grid").innerHTML = jobs.length
    ? jobs.map((job) => buildJobCard(job)).join("")
    : `<div class="empty-state" style="grid-column:1/-1"><div class="es-icon">Search</div><p>No jobs match your search.</p></div>`;
}

function openJobLearningPath(jobId) {
  const job = JOB_LISTINGS.find((item) => item.id === jobId);
  if (!job) return;

  const relatedSkills = SKILLS
    .filter((skill) => {
      const blob = [skill.title, ...(skill.tags || []), ...(skill.categories || [])].join(" ").toLowerCase();
      return job.requiredSkills.some((tag) => blob.includes(String(tag).toLowerCase()));
    })
    .slice(0, 5);

  const neededSkills = [...new Set([...(job.requiredSkills || []), ...relatedSkills.flatMap((skill) => skill.tags || [])])]
    .slice(0, 10);

  document.getElementById("job-learning-title").textContent = `${job.role} at ${job.company}`;
  document.getElementById("job-learning-sub").textContent = `Start this path to become job-ready for ${job.company}.`;
  document.getElementById("job-learning-required").innerHTML = neededSkills.length
    ? neededSkills.map((skill) => `<span class="tag">${escapeHTML(skill)}</span>`).join("")
    : `<span class="tag">Communication</span><span class="tag">Problem Solving</span>`;

  const learningSteps = [
    `Understand role basics and expectations for ${job.role}.`,
    `Build fundamentals in ${neededSkills.slice(0, 3).join(", ")}.`,
    `Practice with mini projects aligned to ${job.company} workflows.`,
    `Create one portfolio project and one case-study for interviews.`,
    `Revise interview questions and apply with confidence.`
  ];
  document.getElementById("job-learning-steps").innerHTML = learningSteps
    .map((step, index) => `
      <div class="roadmap-step">
        <div class="step-num">${index + 1}</div>
        <div class="step-text"><strong>Step ${index + 1}</strong><span>${escapeHTML(step)}</span></div>
      </div>
    `)
    .join("");

  const enrollBtn = document.getElementById("job-learning-enroll-btn");
  if (enrollBtn) {
    enrollBtn.onclick = () => {
      relatedSkills.slice(0, 3).forEach((skill) => {
        if (!state.enrolledCourses.some((course) => course.id === skill.id)) {
          const course = buildEnrolledCourse(skill.id, { progress: 0 });
          if (course) {
            state.enrolledCourses.push(course);
            state.milestoneByCourse[course.id] = 0;
            state.lessonCursorByCourse[course.id] = 0;
            getLessonCheck(course.id, 0);
          }
        }
      });
      addActivity(`Started learning path for ${job.role} at ${job.company}`);
      showToast(`Learning path started for ${job.role}.`, "success");
      document.getElementById("job-learning-modal").classList.remove("open");
      renderExplore();
      if (document.getElementById("page-dashboard").classList.contains("active")) renderDashboard();
      scheduleProfileSync();
    };
  }

  document.getElementById("job-learning-modal").classList.add("open");
}

function closeJobLearningModal(e) {
  const modal = document.getElementById("job-learning-modal");
  if (!modal) return;
  if (!e || e.target === modal) modal.classList.remove("open");
}
// SKILL CARD BUILDER ───────────────────────────────

function getRoleCompanyMatch(skill) {
  const blob = [
    skill.title,
    skill.desc,
    ...(skill.tags || []),
    ...(skill.categories || [])
  ]
    .join(" ")
    .toLowerCase();

  if (blob.includes("ux") || blob.includes("design") || blob.includes("figma")) {
    return { role: "UI/UX Designer", companies: ["Google", "Adobe", "Swiggy", "Zomato", "Flipkart"] };
  }
  if (blob.includes("marketing") || blob.includes("seo") || blob.includes("ads") || blob.includes("crm")) {
    return { role: "Growth Marketing Specialist", companies: ["HubSpot", "Amazon", "Unacademy", "Nykaa", "Meesho"] };
  }
  if (blob.includes("data") || blob.includes("sql") || blob.includes("tableau") || blob.includes("power bi")) {
    return { role: "Data Analyst", companies: ["Accenture", "Deloitte", "TCS", "Infosys", "Wipro"] };
  }
  if (blob.includes("machine learning") || blob.includes("ai") || blob.includes("prompt")) {
    return { role: "ML Engineer", companies: ["Google DeepMind", "Microsoft", "NVIDIA", "OpenAI", "Anthropic"] };
  }
  if (blob.includes("devops") || blob.includes("cloud") || blob.includes("aws")) {
    return { role: "Cloud/DevOps Engineer", companies: ["AWS", "Microsoft", "IBM", "Oracle", "PayPal"] };
  }
  if (blob.includes("security") || blob.includes("cyber")) {
    return { role: "Cybersecurity Analyst", companies: ["Palo Alto Networks", "CrowdStrike", "Cisco", "HCLTech", "Capgemini"] };
  }
  if (blob.includes("node") || blob.includes("api") || blob.includes("backend")) {
    return { role: "Backend Developer", companies: ["Razorpay", "PhonePe", "Paytm", "Zoho", "Freshworks"] };
  }
  if (blob.includes("react") || blob.includes("frontend") || blob.includes("flutter") || blob.includes("mobile")) {
    return { role: "Frontend/Mobile Developer", companies: ["Meta", "Google", "Uber", "Airbnb", "Atlassian"] };
  }
  if (blob.includes("qa") || blob.includes("testing")) {
    return { role: "QA Automation Engineer", companies: ["Cognizant", "Infosys", "LTIMindtree", "EPAM", "Thoughtworks"] };
  }
  if (blob.includes("product")) {
    return { role: "Product Manager", companies: ["Microsoft", "Atlassian", "Notion", "CRED", "Jio"] };
  }
  if (blob.includes("finance") || blob.includes("excel")) {
    return { role: "Business Analyst", companies: ["KPMG", "EY", "PwC", "Goldman Sachs", "JPMorgan Chase"] };
  }

  return { role: "Software Associate", companies: ["Google", "Microsoft", "Amazon", "TCS", "Infosys"] };
}
function buildSkillCard(s, showReason) {
  const dots = [1,2,3,4].map(i=>`<div class="diff-dot${i<=s.difficulty?' filled':''}"></div>`).join('');
  const isSaved = state.savedSkills.some(sk=>sk.id===s.id);
  const isEnrolled = state.enrolledCourses.some(c=>c.id===s.id);
  const pct = s.match || 80;
  const safeTitle = escapeHTML(s.title);
  const safeDesc = escapeHTML(showReason && s.aiReason ? s.aiReason : s.desc);
  const safeDuration = escapeHTML(s.duration);
  const safeTags = s.tags.map(t=>`<span class="tag">${escapeHTML(t)}</span>`).join('');
  const matchMeta = getRoleCompanyMatch(s);
  const safeRole = escapeHTML(matchMeta.role);
  const safeCompanies = matchMeta.companies.map((name) => escapeHTML(name)).join(", ");
  return `
    <div class="skill-card" onclick="openSkillDetail(${s.id})">
      ${s.isNew ? '<div class="badge-new">NEW</div>' : ''}
      <div class="skill-card-top">
        <div class="skill-icon-wrap" style="background:${s.iconBg}">${s.icon}</div>
        <span class="match-badge ${s.matchClass}">${pct}% match</span>
      </div>
      <h3>${safeTitle}</h3>
      <p>${safeDesc}</p>
      <div class="skill-tags">${safeTags}</div>
      <div style="margin:.05rem 0 .95rem;padding:.65rem .75rem;background:var(--cream);border:1px solid var(--border);border-radius:var(--radius-sm)">
        <div style="font-size:.76rem;color:var(--ink-soft);line-height:1.5"><strong style="color:var(--ink)">Role match:</strong> ${safeRole}</div>
        <div style="font-size:.74rem;color:var(--ink-mute);line-height:1.55;margin-top:.2rem"><strong style="color:var(--ink-soft)">Top companies:</strong> ${safeCompanies}</div>
      </div>
      <div class="skill-meta">
        <span>Time: ${safeDuration}</span>
        <div class="difficulty-bar">${dots}</div>
        <button class="save-btn" onclick="toggleSave(event,${s.id})" title="${isSaved?'Unsave':'Save'}">${isSaved?'Saved':'Save'}</button>
      </div>
      <button class="enroll-btn ${isEnrolled?'enrolled':''}" onclick="enrollCourse(event,${s.id})">${isEnrolled?'Enrolled':'Enroll now'}</button>
    </div>`;
}

// ─── SKILL DETAIL ─────────────────────────────────────
function openSkillDetail(id) {
  const s = SKILLS.find(sk=>sk.id===id);
  if (!s) return;
  document.getElementById('skill-modal-title').textContent = s.title;
  const isEnrolled = state.enrolledCourses.some(c=>c.id===s.id);
  const isSaved = state.savedSkills.some(sk=>sk.id===s.id);
  const matchMeta = getRoleCompanyMatch(s);
  document.getElementById('skill-modal-body').innerHTML = `
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.25rem">
      <div class="skill-icon-wrap" style="background:${s.iconBg};width:56px;height:56px;font-size:1.7rem">${s.icon}</div>
      <div>
        <span class="match-badge ${s.matchClass}">${s.match}% match</span>
        <p style="font-size:.82rem;color:var(--ink-soft);margin-top:.35rem">${s.level.charAt(0).toUpperCase()+s.level.slice(1)} · ${s.duration}</p>
      </div>
    </div>
    <p style="font-size:.9rem;color:var(--ink-soft);line-height:1.65;margin-bottom:1.25rem">${s.desc}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1.25rem">
      <div style="background:var(--cream);border-radius:var(--radius-sm);padding:1rem">
        <div style="font-size:.75rem;color:var(--ink-mute);font-weight:600;text-transform:uppercase;letter-spacing:.07em">Salary range</div>
        <div style="font-size:1.05rem;font-weight:600;margin-top:.3rem">${s.salary}</div>
      </div>
      <div style="background:var(--cream);border-radius:var(--radius-sm);padding:1rem">
        <div style="font-size:.75rem;color:var(--ink-mute);font-weight:600;text-transform:uppercase;letter-spacing:.07em">Job openings</div>
        <div style="font-size:1.05rem;font-weight:600;margin-top:.3rem">${s.jobCount}</div>
      </div>
    </div>
    <div style="margin-bottom:1.25rem">
      <div style="font-size:.78rem;color:var(--ink-mute);font-weight:600;text-transform:uppercase;letter-spacing:.07em;margin-bottom:.6rem">Topics covered</div>
      <div class="skill-tags">${s.tags.map(t=>`<span class="tag">${t}</span>`).join('')}</div>
    </div>
    <div style="margin-bottom:1.25rem">
      <div style="font-size:.78rem;color:var(--ink-mute);font-weight:600;text-transform:uppercase;letter-spacing:.07em;margin-bottom:.6rem">Role and company match</div>
      <div style="background:var(--cream);border-radius:var(--radius-sm);padding:.9rem;border:1px solid var(--border)">
        <div style="font-size:.85rem;color:var(--ink-soft);line-height:1.5"><strong style="color:var(--ink)">Role:</strong> ${escapeHTML(matchMeta.role)}</div>
        <div style="font-size:.8rem;color:var(--ink-mute);line-height:1.55;margin-top:.35rem"><strong style="color:var(--ink-soft)">Top 5 companies:</strong> ${matchMeta.companies.map((name) => escapeHTML(name)).join(", ")}</div>
      </div>
    </div>
    <div style="display:flex;gap:.75rem;flex-wrap:wrap">
      <button class="btn-primary" style="flex:1" onclick="enrollCourseFromModal(${s.id})">${isEnrolled?'✓ Enrolled':'Enroll now →'}</button>
      <button class="btn-secondary" onclick="toggleSaveFromModal(${s.id})">${isSaved?'🔖 Saved':'🔲 Save'}</button>
    </div>
  `;
  document.getElementById('skill-modal').classList.add('open');
}
function closeSkillModal(e) { if(e.target===document.getElementById('skill-modal')) document.getElementById('skill-modal').classList.remove('open'); }

// ─── ENROLL / SAVE ────────────────────────────────────
function enrollCourse(e, id) {
  e.stopPropagation();
  if (!state.user) { openAuth('login'); return; }
  const s = buildEnrolledCourse(id, { progress: 0 });
  if (!s) return;
  if (state.enrolledCourses.some(c=>c.id===id)) return;
  state.enrolledCourses.push(s);
  state.milestoneByCourse[s.id] = 0;
  state.lessonCursorByCourse[s.id] = 0;
  getLessonCheck(s.id, 0);
  addActivity(`Enrolled in "${s.title}"`);
  showToast(`Enrolled in ${s.title}!`,'success');
  renderExplore();
  renderAIResults(state.aiRecommendations);
  scheduleProfileSync();
}
function enrollCourseFromModal(id) {
  if (!state.user) { openAuth('login'); return; }
  const s = buildEnrolledCourse(id, { progress: 0 });
  if (!s || state.enrolledCourses.some(c=>c.id===id)) { showToast('Already enrolled!'); return; }
  state.enrolledCourses.push(s);
  state.milestoneByCourse[s.id] = 0;
  state.lessonCursorByCourse[s.id] = 0;
  getLessonCheck(s.id, 0);
  addActivity(`Enrolled in "${s.title}"`);
  showToast(`Enrolled in ${s.title}!`,'success');
  document.getElementById('skill-modal').classList.remove('open');
  renderExplore();
  if (state.aiRecommendations.length) renderAIResults(state.aiRecommendations);
  scheduleProfileSync();
}
function toggleSave(e, id) {
  e.stopPropagation();
  if (!state.user) { openAuth('login'); return; }
  const s = SKILLS.find(sk=>sk.id===id);
  if (!s) return;
  const idx = state.savedSkills.findIndex(sk=>sk.id===id);
  if (idx>=0) { state.savedSkills.splice(idx,1); showToast('Removed from saved'); }
  else { state.savedSkills.push(s); addActivity(`Saved "${s.title}"`); showToast(`Saved ${s.title}!`,'success'); }
  renderExplore();
  if (state.aiRecommendations.length) renderAIResults(state.aiRecommendations);
  scheduleProfileSync();
}
function toggleSaveFromModal(id) {
  if (!state.user) { openAuth('login'); return; }
  const s = SKILLS.find(sk=>sk.id===id);
  if (!s) return;
  const idx = state.savedSkills.findIndex(sk=>sk.id===id);
  if (idx>=0) { state.savedSkills.splice(idx,1); showToast('Removed from saved'); }
  else { state.savedSkills.push(s); addActivity(`Saved "${s.title}"`); showToast(`Saved ${s.title}!`,'success'); }
  openSkillDetail(id);
  renderExplore();
  if (state.aiRecommendations.length) renderAIResults(state.aiRecommendations);
  scheduleProfileSync();
}
function removeSaved(id) {
  const idx = state.savedSkills.findIndex(s=>s.id===id);
  if (idx>=0) state.savedSkills.splice(idx,1);
  renderDashboard();
  showToast('Removed from saved');
  renderExplore();
  if (state.aiRecommendations.length) renderAIResults(state.aiRecommendations);
  scheduleProfileSync();
}

// ─── PATH MODAL ───────────────────────────────────────
function openPathModal(key) {
  const d = PATHS[key];
  if (!d) return;
  state.currentPath = key;
  document.getElementById('modal-title').textContent = d.title;
  document.getElementById('modal-desc').textContent = d.desc;
  document.getElementById('modal-roadmap').innerHTML = d.steps.map((s,i)=>`
    <div class="roadmap-step">
      <div class="step-num">${i+1}</div>
      <div class="step-text"><strong>${s.title}</strong><span>${s.desc}</span></div>
    </div>`).join('');
  const btn = document.getElementById('modal-enroll-btn');
  btn.textContent = 'Enroll in this path →';
  btn.disabled = false;
  document.getElementById('path-modal').classList.add('open');
}
function closePathModal(e) { if(e.target===document.getElementById('path-modal')) document.getElementById('path-modal').classList.remove('open'); }
function enrollPath() {
  if (!state.user) { document.getElementById('path-modal').classList.remove('open'); openAuth('login'); return; }
  const d = PATHS[state.currentPath];
  if (!d) return;
  addActivity(`Enrolled in path: "${d.title}"`);
  showToast(`Enrolled in ${d.title}!`,'success');
  document.getElementById('modal-enroll-btn').textContent = '✓ Enrolled!';
  document.getElementById('modal-enroll-btn').disabled = true;
  setTimeout(()=>document.getElementById('path-modal').classList.remove('open'),1200);
  scheduleProfileSync();
}

// ─── AI CHAT ─────────────────────────────────────────
async function sendChat() {
  if (state.isChatBusy) return;
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  appendMsg(msg, 'user');
  state.isChatBusy = true;
  document.getElementById('chat-send-btn').disabled = true;
  const typing = appendMsg('Thinking…','ai typing');

  try {
    const data = await postJSON("/api/ai/chat", { message: msg });
    typing.textContent = data.reply || "I can help map your next learning steps. Share your goal and weekly hours.";
    typing.classList.remove('typing');
  } catch(e) {
    typing.textContent = "I'm having trouble connecting right now. Please try again in a moment!";
    typing.classList.remove('typing');
    console.warn("Chat request failed:", e.message);
  }
  state.isChatBusy = false;
  document.getElementById('chat-send-btn').disabled = false;
  if (state.user) addActivity(`Asked AI: "${msg.slice(0,50)}${msg.length>50?'…':''}"`);
}

function quickChat(msg) {
  document.getElementById('chat-input').value = msg;
  sendChat();
}

function appendMsg(text, type) {
  const div = document.createElement('div');
  div.className = 'msg ' + type;
  div.textContent = text;
  const container = document.getElementById('chat-messages');
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function generateWeeklyPlan(forceRegenerate = false) {
  if (!state.user) { openAuth('login'); return; }
  if (!forceRegenerate && state.weeklyPlan.length) {
    renderWeeklyPlan();
    return;
  }
  if (state.enrolledCourses.length === 0) {
    state.weeklyPlan = [];
    renderWeeklyPlan();
    return;
  }

  const availableHours = inferWeeklyHours();
  const focusCourses = [...state.enrolledCourses]
    .filter((course) => course.progress < 100)
    .sort((a, b) => a.progress - b.progress)
    .slice(0, 3);

  if (focusCourses.length === 0) {
    state.weeklyPlan = [];
    renderWeeklyPlan();
    return;
  }

  const weightedLoad = focusCourses.reduce((sum, course) => {
    const remaining = 100 - clampNumber(course.progress, 0, 100, 0);
    return sum + remaining * Math.max(1, course.difficulty || 1);
  }, 0);
  let hoursLeft = availableHours;
  state.weeklyPlan = focusCourses.map((course, index) => {
    const remaining = 100 - clampNumber(course.progress, 0, 100, 0);
    const weight = (remaining * Math.max(1, course.difficulty || 1)) / Math.max(1, weightedLoad);
    const suggested = Math.max(1, Math.round(availableHours * weight));
    const hours = index === focusCourses.length - 1 ? Math.max(1, hoursLeft) : Math.max(1, Math.min(hoursLeft - (focusCourses.length - index - 1), suggested));
    hoursLeft -= hours;
    const progressCap = Math.max(3, 100 - clampNumber(course.progress, 0, 100, 0));
    const targetProgress = Math.min(progressCap, clampNumber(Math.round(hours * (course.difficulty <= 2 ? 4 : 3)), 3, 18, 6));
    return {
      courseId: course.id,
      title: course.title,
      hours,
      targetProgress,
      done: false
    };
  });

  addActivity(`Generated weekly learning plan (${availableHours} hrs/week)`);
  renderWeeklyPlan();
  scheduleProfileSync();
}

function completeWeeklyTask(index) {
  const task = state.weeklyPlan[index];
  if (!task || task.done) return;

  task.done = true;
  const course = state.enrolledCourses.find((item) => item.id === task.courseId);
  if (course) {
    const prevProgress = clampNumber(course.progress, 0, 100, 0);
    const nextProgress = Math.min(100, prevProgress + task.targetProgress);
    course.progress = nextProgress;
    maybeTriggerMilestone(course, prevProgress, nextProgress);
  }
  addActivity(`Completed weekly plan task for "${task.title}"`);
  renderDashboard();
  showToast("Nice work. Task completed and progress updated.", "success");
  scheduleProfileSync();
}

function renderWeeklyPlan() {
  const summaryEl = document.getElementById("planner-summary");
  const listEl = document.getElementById("planner-list");
  const dailyListEl = document.getElementById("daily-study-list");
  if (!summaryEl || !listEl) return;

  if (!state.weeklyPlan.length) {
    summaryEl.textContent = "Generate a realistic weekly plan based on your current commitments and enrolled courses.";
    listEl.innerHTML = `<div class="empty-state" style="padding:1rem"><p>No plan yet. Generate one.</p></div>`;
    if (dailyListEl) {
      dailyListEl.innerHTML = `<div class="empty-state" style="padding:1rem"><p>Generate a weekly plan to view daily tasks.</p></div>`;
    }
    return;
  }

  const totalHours = state.weeklyPlan.reduce((sum, item) => sum + item.hours, 0);
  const doneCount = state.weeklyPlan.filter((item) => item.done).length;
  summaryEl.textContent = `Planned ${totalHours} hours this week across ${state.weeklyPlan.length} focus courses. ${doneCount}/${state.weeklyPlan.length} tasks completed.`;

  listEl.innerHTML = state.weeklyPlan
    .map((task, idx) => `
      <div class="planner-item ${task.done ? "done" : ""}">
        <div>
          <strong>${task.title}</strong>
          <span>${task.hours}h planned · +${task.targetProgress}% target progress</span>
        </div>
        ${task.done ? `<span style="font-size:.72rem;color:var(--teal-dark);font-weight:700">Done</span>` : `<button onclick="completeWeeklyTask(${idx})">Mark done</button>`}
      </div>
    `)
    .join("");

  if (dailyListEl) {
    const dailyTasks = state.weeklyPlan.flatMap((task) => {
      const sessions = Math.max(1, Math.ceil(task.hours / 2));
      const sessionHours = Math.max(1, Math.round((task.hours / sessions) * 10) / 10);
      return Array.from({ length: sessions }).map((_, idx) => ({
        title: task.title,
        hours: sessionHours,
        note: idx === sessions - 1 ? "checkpoint review" : "focused practice"
      }));
    });

    dailyListEl.innerHTML = dailyTasks
      .slice(0, 8)
      .map(
        (item, idx) => `
      <div class="planner-item">
        <div>
          <strong>Session ${idx + 1}: ${escapeHTML(item.title)}</strong>
          <span>${item.hours}h · ${item.note}</span>
        </div>
      </div>
    `
      )
      .join("");
  }
}

function parseActivityDate(value) {
  const ts = Date.parse(String(value || ""));
  return Number.isFinite(ts) ? ts : null;
}

function buildTodayFocus() {
  if (!state.enrolledCourses.length) {
    return {
      summary: "Enroll in a course to generate your next best task.",
      items: []
    };
  }

  const pendingPlan = state.weeklyPlan.find((task) => !task.done);
  if (pendingPlan) {
    const course = state.enrolledCourses.find((item) => item.id === pendingPlan.courseId);
    return {
      summary: "You already have a weekly plan. Focus on the highest-impact pending task.",
      items: [
        `${pendingPlan.title}: dedicate ${pendingPlan.hours}h today and target +${pendingPlan.targetProgress}% progress.`,
        course ? `Current progress: ${clampNumber(course.progress, 0, 100, 0)}%` : "Keep momentum with a focused deep-work block."
      ]
    };
  }

  const nextCourse = [...state.enrolledCourses]
    .filter((course) => clampNumber(course.progress, 0, 100, 0) < 100)
    .sort((a, b) => clampNumber(a.progress, 0, 100, 0) - clampNumber(b.progress, 0, 100, 0))[0];

  if (!nextCourse) {
    return {
      summary: "All enrolled courses are complete. Great work.",
      items: ["Generate a new assessment to unlock your next learning path."]
    };
  }

  return {
    summary: "No weekly plan found, so here is your best immediate next action.",
    items: [
      `Continue ${nextCourse.title} for a focused 45-minute session.`,
      `Current progress: ${clampNumber(nextCourse.progress, 0, 100, 0)}%.`
    ]
  };
}

function estimateGoalEtaWeeks() {
  if (!state.enrolledCourses.length) return null;

  const remainingProgress = state.enrolledCourses.reduce(
    (sum, course) => sum + Math.max(0, 100 - clampNumber(course.progress, 0, 100, 0)),
    0
  );
  if (remainingProgress <= 0) return 0;

  const weeklyPlannedProgress = state.weeklyPlan.length
    ? state.weeklyPlan.reduce((sum, task) => sum + (task.done ? 0 : task.targetProgress), 0)
    : Math.max(8, inferWeeklyHours() * 3);

  return Math.max(1, Math.ceil(remainingProgress / Math.max(1, weeklyPlannedProgress)));
}

function buildRiskAlerts() {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const activityWithTime = state.activityLog
    .map((entry) => ({ ...entry, ts: parseActivityDate(entry.time) }))
    .filter((entry) => entry.ts !== null);

  return state.enrolledCourses
    .filter((course) => clampNumber(course.progress, 0, 100, 0) < 100)
    .map((course) => {
      const latest = activityWithTime
        .filter((entry) => String(entry.text || "").toLowerCase().includes(String(course.title || "").toLowerCase()))
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
      const stale = !latest || now - latest.ts > weekMs;
      return {
        course,
        stale,
        daysSince: latest ? Math.floor((now - latest.ts) / (24 * 60 * 60 * 1000)) : null
      };
    })
    .filter((item) => item.stale)
    .sort((a, b) => clampNumber(a.course.progress, 0, 100, 0) - clampNumber(b.course.progress, 0, 100, 0))
    .slice(0, 3);
}

function renderExecutionInsights() {
  const focusSummaryEl = document.getElementById("today-focus-summary");
  const focusListEl = document.getElementById("today-focus-list");
  const etaSummaryEl = document.getElementById("goal-eta-summary");
  const riskListEl = document.getElementById("risk-alert-list");
  if (!focusSummaryEl || !focusListEl || !etaSummaryEl || !riskListEl) return;

  const focus = buildTodayFocus();
  focusSummaryEl.textContent = focus.summary;
  focusListEl.innerHTML = focus.items.length
    ? focus.items.map((item) => `<div class="planner-item"><div><strong>${item}</strong></div></div>`).join("")
    : `<div class="empty-state" style="padding:1rem"><p>No focus task yet.</p></div>`;

  const etaWeeks = estimateGoalEtaWeeks();
  if (etaWeeks === null) {
    etaSummaryEl.textContent = "Enroll in courses to estimate your goal completion timeline.";
  } else if (etaWeeks === 0) {
    etaSummaryEl.textContent = "You have completed all enrolled courses. Start a new path to keep growing.";
  } else {
    etaSummaryEl.textContent = `At your current pace, you can complete your current learning goal in about ${etaWeeks} week${etaWeeks === 1 ? "" : "s"}.`;
  }

  const alerts = buildRiskAlerts();
  riskListEl.innerHTML = alerts.length
    ? alerts
        .map((item) => {
          const pct = clampNumber(item.course.progress, 0, 100, 0);
          const lag = item.daysSince === null ? "No recent activity found" : `No activity in ${item.daysSince} days`;
          return `<div class="planner-item"><div><strong>${item.course.title}</strong><span>${lag} · ${pct}% complete</span></div></div>`;
        })
        .join("")
    : `<div class="empty-state" style="padding:1rem"><p>No learning risk alerts.</p></div>`;
}

function analyzeSkillGap(roleKey) {
  const role = ROLE_PROFILES[roleKey] || ROLE_PROFILES.data_analyst;
  state.selectedGapRole = roleKey in ROLE_PROFILES ? roleKey : "data_analyst";
  const container = document.getElementById("gap-analysis");
  if (!container) return;

  const userSignals = extractUserSignals();
  const missingSignals = role.requiredSignals.filter((signal) => {
    for (const token of userSignals) {
      if (token.includes(signal) || signal.includes(token)) return false;
    }
    return true;
  });

  const recommended = SKILLS
    .filter((skill) => !state.enrolledCourses.some((course) => course.id === skill.id))
    .map((skill) => {
      const blob = skillSearchBlob(skill);
      const overlap = missingSignals.filter((signal) => blob.includes(signal)).length;
      return { skill, overlap, weightedScore: overlap * 12 + skill.match };
    })
    .filter((item) => item.overlap > 0)
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .map((item) => item.skill)
    .slice(0, 3);

  const coverage = clampNumber(
    Math.round(((role.requiredSignals.length - missingSignals.length) / role.requiredSignals.length) * 100),
    0,
    100,
    0
  );
  const gapMarkup = missingSignals.length
    ? missingSignals.map((signal) => `<span class="gap-pill">${signal}</span>`).join("")
    : `<span class="gap-pill" style="color:var(--teal-dark);border-color:rgba(42,122,106,.3)">No major gaps detected</span>`;

  const recMarkup = recommended.length
    ? recommended.map((skill) => `<button class="chip" onclick="openSkillDetail(${skill.id})">${skill.title}</button>`).join("")
    : `<span style="font-size:.78rem;color:var(--ink-mute)">Enroll in more courses to unlock suggestions.</span>`;

  container.innerHTML = `
    <p><strong>${role.label}</strong> readiness: ${coverage}%</p>
    <div class="gap-list">${gapMarkup}</div>
    <div>${recMarkup}</div>
  `;
}

function renderInsights() {
  const metricsEl = document.getElementById("insight-metrics");
  const historyEl = document.getElementById("recommendation-history-list");
  if (!metricsEl || !historyEl) return;

  const avgProgress = state.enrolledCourses.length
    ? Math.round(
        state.enrolledCourses.reduce((sum, course) => sum + clampNumber(course.progress, 0, 100, 0), 0) /
          state.enrolledCourses.length
      )
    : 0;
  const savedCount = state.savedSkills.length;
  const recRuns = state.recommendationHistory.length;

  metricsEl.innerHTML = `
    <div class="insight-metric"><strong>${avgProgress}%</strong><span>Average course progress</span></div>
    <div class="insight-metric"><strong>${savedCount}</strong><span>Saved skills</span></div>
    <div class="insight-metric"><strong>${recRuns}</strong><span>Assessment runs</span></div>
  `;

  if (!state.recommendationHistory.length) {
    historyEl.innerHTML = `<div class="empty-state" style="padding:1rem"><p>No recommendation history yet. Complete the assessment to generate insights.</p></div>`;
    return;
  }

  historyEl.innerHTML = [...state.recommendationHistory]
    .reverse()
    .map((entry) => `
      <div class="history-item">
        <strong>${entry.createdAt}</strong>
        <p>${entry.summary}</p>
        <p>Top skills: ${entry.recommendations.slice(0, 3).map((item) => `${item.title} (${item.match}%)`).join(", ")}</p>
      </div>
    `)
    .join("");
}

// ─── DASHBOARD ────────────────────────────────────────
function renderDashboard() {
  if (!state.user) return;
  const initials = state.user.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  document.getElementById('dash-avatar').textContent = initials;
  document.getElementById('dash-name').textContent = state.user.name;
  document.getElementById('dash-email').textContent = state.user.email;
  document.getElementById('settings-name').value = state.user.name;
  document.getElementById('settings-email').value = state.user.email;
  if (state.quizAnswers.goal && document.getElementById('settings-goal')) {
    document.getElementById('settings-goal').value = state.quizAnswers.goal;
  }

  // Enrolled
  const eList = document.getElementById('enrolled-list');
  if (state.enrolledCourses.length === 0) {
    eList.innerHTML = `<div class="empty-state"><div class="es-icon">📚</div><p>No courses yet.<br><a onclick="showPage('explore')" style="color:var(--gold);cursor:pointer;font-weight:500">Browse skills →</a></p></div>`;
  } else {
    eList.innerHTML = state.enrolledCourses.map(c => {
      const pct = clampNumber(c.progress, 0, 100, 0);
      c.progress = pct;
      return `<div class="progress-card" onclick="openSkillDetail(${c.id})">
        <div class="progress-icon">${c.icon}</div>
        <div class="progress-info">
          <strong>${c.title}</strong>
          <div class="progress-bar-outer"><div class="progress-bar-inner" style="width:${pct}%"></div></div>
          <div class="progress-pct">${pct}% complete · Enrolled ${c.enrolledAt}</div>
        </div>
        ${pct >= 100
          ? `<button class="btn-dark" style="font-size:.78rem;padding:.4rem .9rem;white-space:nowrap;background:var(--teal)" onclick="openCertificateModal(event,${c.id})">Get Certificate</button>`
          : `<button class="btn-dark" style="font-size:.78rem;padding:.4rem .9rem;white-space:nowrap" onclick="continueLesson(event,${c.id})">Start lesson -></button>`
        }
      </div>`;
    }).join('');
  }

  // Saved
  const sList = document.getElementById('saved-list');
  if (state.savedSkills.length === 0) {
    sList.innerHTML = `<div class="empty-state"><div class="es-icon">🔖</div><p>Nothing saved yet.<br><a onclick="showPage('explore')" style="color:var(--gold);cursor:pointer;font-weight:500">Explore skills →</a></p></div>`;
  } else {
    sList.innerHTML = state.savedSkills.map(s=>`
      <div class="saved-item" onclick="openSkillDetail(${s.id})">
        <h4>${s.icon} ${s.title}</h4>
        <p>${s.duration} · ${s.level}</p>
        <span class="remove-saved" onclick="event.stopPropagation();removeSaved(${s.id})">✕ Remove</span>
      </div>`).join('');
  }

  // Activity
  const aList = document.getElementById('activity-list');
  if (state.activityLog.length === 0) {
    aList.innerHTML = `<div class="empty-state"><div class="es-icon">⚡</div><p>No activity yet.</p></div>`;
  } else {
    aList.innerHTML = [...state.activityLog].reverse().map(a=>`
      <div class="activity-item">
        <div class="activity-dot"></div>
        <div><div class="activity-text">${a.text}</div><div class="activity-time">${a.time}</div></div>
      </div>`).join('');
  }

  const gapRoleSelect = document.getElementById("gap-role-select");
  if (gapRoleSelect) {
    gapRoleSelect.value = state.selectedGapRole;
  }
  renderWeeklyPlan();
  analyzeSkillGap(state.selectedGapRole);
  renderExecutionInsights();
  renderInsights();
}

function dashTab(btn, tab) {
  document.querySelectorAll('.sidebar-link').forEach(l=>l.classList.remove('active'));
  btn.classList.add('active');
  ['enrolled','insights','saved','activity','settings'].forEach(t=>{
    document.getElementById('dash-'+t).style.display = t===tab?'block':'none';
  });
  if (tab==='enrolled'||tab==='insights'||tab==='saved'||tab==='activity') renderDashboard();
}

function continueLesson(e, id) {
  e.stopPropagation();
  const course = state.enrolledCourses.find((item) => item.id === id);
  if (!course) return;
  state.currentLessonCourseId = id;
  renderLessonModal(course);
  document.getElementById("lesson-modal").classList.add("open");
}

function openCertificateModal(e, id) {
  if (e) e.stopPropagation();
  const course = state.enrolledCourses.find((item) => item.id === Number(id));
  if (!course) return;

  const pct = clampNumber(course.progress, 0, 100, 0);
  if (pct < 100) {
    showToast("Certificate unlocks at 100% completion.", "error");
    return;
  }

  state.currentCertificateCourseId = course.id;
  const learnerName = state.user?.name || "Learner";
  const issuedOn = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  document.getElementById("certificate-learner").textContent = learnerName;
  document.getElementById("certificate-course").textContent = course.title;
  document.getElementById("certificate-date").textContent = issuedOn;
  document.getElementById("certificate-id").textContent = `SRS-${course.id}-${Date.now().toString().slice(-6)}`;
  document.getElementById("certificate-modal").classList.add("open");
}

function closeCertificateModal(e) {
  const modal = document.getElementById("certificate-modal");
  if (!modal) return;
  if (!e || e.target === modal) modal.classList.remove("open");
}

function downloadCertificate() {
  if (state.currentCertificateCourseId === null) return;
  const course = state.enrolledCourses.find((item) => item.id === state.currentCertificateCourseId);
  if (!course) return;

  const sanitize = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
  const learnerName = sanitize(state.user?.name || "Learner");
  const safeCourseTitle = sanitize(course.title);
  const issuedOn = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const certId = `SRS-${course.id}-${Date.now().toString().slice(-6)}`;

  const certificateHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Certificate - ${safeCourseTitle}</title>
  <style>
    body{margin:0;padding:0;background:#f5efe3;font-family:Georgia,serif}
    .sheet{max-width:980px;margin:30px auto;background:#fff;border:12px solid #c9963a;padding:60px 70px;color:#1a1714}
    h1{margin:0 0 18px;font-size:48px;letter-spacing:1px}
    .sub{font-size:20px;margin:0 0 26px;color:#5a5550}
    .name{font-size:42px;font-weight:700;margin:20px 0 14px}
    .course{font-size:28px;margin:0 0 20px}
    .meta{font-size:17px;color:#5a5550;margin-top:35px}
  </style>
</head>
<body>
  <div class="sheet">
    <h1>Certificate of Completion</h1>
    <p class="sub">Skill Recommendation System</p>
    <p>This is to certify that</p>
    <div class="name">${learnerName}</div>
    <p>has successfully completed</p>
    <div class="course">${safeCourseTitle}</div>
    <p>with 100% progress and all required lessons completed.</p>
    <p class="meta">Issued on ${issuedOn} | Certificate ID: ${certId}</p>
  </div>
</body>
</html>`;

  const blob = new Blob([certificateHtml], { type: "text/html;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${course.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-certificate.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
  addActivity(`Downloaded certificate for "${course.title}"`);
  showToast("Certificate downloaded.", "success");
}

function saveSettings() {
  const nextName = document.getElementById('settings-name').value.trim();
  if (!nextName || !state.user?.email) { showToast('Name and email are required','error'); return; }

  state.user.name = nextName;
  document.getElementById('settings-email').value = state.user.email;
  state.quizAnswers.goal = document.getElementById('settings-goal').value || state.quizAnswers.goal;
  renderNavUser();
  addActivity('Updated account settings');
  showToast('Settings saved!','success');
  renderDashboard();
  scheduleProfileSync(250);
}

// ─── HELPERS ─────────────────────────────────────────
function addActivity(text) {
  state.activityLog.push({
    text: escapeHTML(text),
    time: escapeHTML(new Date().toLocaleString())
  });
  if (state.activityLog.length > 200) state.activityLog = state.activityLog.slice(-200);
  scheduleProfileSync();
}

function showToast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type?' '+type:'');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.className='toast',3000);
}

// ─── INIT ─────────────────────────────────────────────
renderExplore();

bootstrapSession();







