function parseJwt(token) {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
  return JSON.parse(jsonPayload);
}

async function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const output = document.getElementById("output");

  if (!username || !password) {
    output.textContent = "Please enter both username and password.";
    output.className = "mt-4 text-sm error";
    return;
  }

  const basicAuth = btoa(`${username}:${password}`);
  output.textContent = "Logging in...";
  output.className = "mt-4 text-sm text-gray-300";

  try {
    const res = await fetch("https://learn.reboot01.com/api/auth/signin", {
      method: "POST",
      headers: { Authorization: `Basic ${basicAuth}` },
    });

    const rawToken = await res.text();
    const token = rawToken.replace(/^"|"$/g, "");

    if (!token || token.split(".").length !== 3) {
      throw new Error("Invalid or malformed JWT token");
    }

    const payload = parseJwt(token);
    const userId = parseInt(payload["x-hasura-user-id"] || payload["sub"], 10);

    if (!userId) throw new Error("User ID not found in JWT payload");

    localStorage.setItem("jwt_token", token);
    localStorage.setItem("user_id", userId);

    output.textContent = "Login successful...";
    output.className = "mt-4 text-sm success";

    setTimeout(() => (window.location.href = "dashboard.html"), 1000);
  } catch (err) {
    output.textContent = "Error: " + err.message;
    output.className = "mt-4 text-sm error";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const loginBtn = document.getElementById("login-btn");
  loginBtn.addEventListener("click", login);

  const username = document.getElementById("username");
  const password = document.getElementById("password");
  [username, password].forEach((input) => {
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") login();
    });
  });
});
