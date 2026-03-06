const loginForm = document.getElementById("auth-login-form");
const registerForm = document.getElementById("auth-register-form");
const switchAuthBtn = document.getElementById("btn-switch-auth");
const loginAccountInput = document.getElementById("login-account");
const loginPasswordInput = document.getElementById("login-password");
const registerAccountInput = document.getElementById("register-account");
const registerUsernameInput = document.getElementById("register-username");
const registerPasswordInput = document.getElementById("register-password");
const registerConfirmInput = document.getElementById("register-confirm");
const loginBtn = document.getElementById("btn-login");
const registerBtn = document.getElementById("btn-register");
const statusElement = document.getElementById("status");

let mode = "login";
let pending = false;

function localizeAuthErrorMessage(message) {
  const raw = typeof message === "string" ? message.trim() : String(message ?? "");
  if (!raw) return "未知错误";
  const lower = raw.toLowerCase();
  const mappings = [
    ["account already exists", "账号已存在"],
    ["account length must be 3-32", "账号长度需在 3-32 之间"],
    ["account cannot contain spaces", "账号不能包含空格"],
    ["username is required", "用户名不能为空"],
    ["username length must be 2-24", "用户名长度需在 2-24 之间"],
    ["password length must be 6-64", "密码长度需在 6-64 之间"],
    ["account not found", "账号不存在"],
    ["invalid password", "密码错误"],
    ["login failed", "登录失败"],
    ["register failed", "注册失败"]
  ];
  for (const [keyword, translated] of mappings) {
    if (lower.includes(keyword)) return translated;
  }
  return raw;
}

function setStatus(text, type = "normal") {
  if (!statusElement) return;
  statusElement.textContent = text;
  statusElement.classList.remove("error", "success");
  if (type === "error") statusElement.classList.add("error");
  if (type === "success") statusElement.classList.add("success");
}

function setPending(nextPending) {
  pending = Boolean(nextPending);
  loginBtn.disabled = pending;
  registerBtn.disabled = pending;
  switchAuthBtn.disabled = pending;
}

function setMode(nextMode) {
  mode = nextMode === "register" ? "register" : "login";
  const isLogin = mode === "login";
  loginForm.classList.toggle("hidden", !isLogin);
  registerForm.classList.toggle("hidden", isLogin);
  switchAuthBtn.textContent = isLogin ? "没有账号？去注册" : "已有账号？去登录";
  setStatus(isLogin ? "请先登录" : "请填写注册信息");
}

async function loginAndEnter() {
  const account = loginAccountInput.value.trim();
  const password = loginPasswordInput.value.trim();
  if (!account || !password) {
    setStatus("请填写账号和密码。", "error");
    return;
  }

  setPending(true);
  setStatus("登录中...");
  try {
    const result = await window.petApi.authLogin(account, password);
    if (!result?.ok) {
      setStatus(`登录失败：${localizeAuthErrorMessage(result?.error || "未知错误")}`, "error");
      return;
    }
    setStatus(
      `登录成功，欢迎 ${result.currentUser?.username || result.currentUser?.account || account}。`,
      "success"
    );
    window.close();
  } catch (error) {
    setStatus(
      `登录失败：${localizeAuthErrorMessage(error instanceof Error ? error.message : "未知错误")}`,
      "error"
    );
  } finally {
    setPending(false);
  }
}

async function registerAndEnter() {
  const account = registerAccountInput.value.trim();
  const username = registerUsernameInput.value.trim();
  const password = registerPasswordInput.value.trim();
  const confirm = registerConfirmInput.value.trim();
  if (!account || !username || !password || !confirm) {
    setStatus("请填写完整注册信息。", "error");
    return;
  }
  if (password !== confirm) {
    setStatus("两次输入的密码不一致。", "error");
    return;
  }

  setPending(true);
  setStatus("注册中...");
  try {
    const result = await window.petApi.authRegister(account, password, username);
    if (!result?.ok) {
      setStatus(`注册失败：${localizeAuthErrorMessage(result?.error || "未知错误")}`, "error");
      return;
    }
    setStatus(
      `注册成功，欢迎 ${result.currentUser?.username || username}（${result.currentUser?.account || account}）。`,
      "success"
    );
    window.close();
  } catch (error) {
    setStatus(
      `注册失败：${localizeAuthErrorMessage(error instanceof Error ? error.message : "未知错误")}`,
      "error"
    );
  } finally {
    setPending(false);
  }
}

function bindEvents() {
  switchAuthBtn.addEventListener("click", () => {
    if (pending) return;
    setMode(mode === "login" ? "register" : "login");
  });

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void loginAndEnter();
  });

  registerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void registerAndEnter();
  });

  window.petApi.onAuthState((session) => {
    if (session?.ok && session.currentUser?.account) {
      window.close();
    }
  });
}

async function bootstrap() {
  try {
    const session = await window.petApi.getAuthSession();
    if (session?.ok && session.currentUser?.account) {
      setStatus(`已登录：${session.currentUser.account}，正在进入...`, "success");
      window.close();
      return;
    }
  } catch {
    // ignore and stay on auth view
  }
  bindEvents();
  setMode("login");
}

bootstrap();
