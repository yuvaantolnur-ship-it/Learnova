async function login() {
      const username = document.getElementById("username").value;
      const password = document.getElementById("password").value;

      const res = await fetch("/login", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem("user", username);
        window.location.href = "/";
      } else {
        alert("Invalid login");
      }
    }

    async function signup() {
      const username = document.getElementById("username").value;
      const password = document.getElementById("password").value;

      const res = await fetch("/signup", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (data.success) {
        alert("Account created! You can login now.");
      } else {
        alert("User already exists!");
      }
    }