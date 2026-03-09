/* ---------------------------------------------------------
   Random Password Generator – Frontend logic
   Connects to Flask backend: POST /api/generate-password
--------------------------------------------------------- */

(function () {
    "use strict";

    // ---------- Helpers ----------
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    // ---------- DOM refs ----------
    const strengthGroup = $(".strength");
    const strengthButtons = $$(".strength .pill");
    const cards = $$(".controls .card");
    const ctaBtn = $("#btn_generate");
    const copyBtn = $("#btn_copy");
    const passwordBox = $("#password_box");
    const bannerError = $("#banner_error");
    const toast = $("#toast");

    // ---------- Card label -> key mapping ----------
    const LABEL_MAP = {
        "Password Length:": "length",
        "Uppercase Letters:": "upper",
        "Lowercase Letters:": "lower",
        "Numbers:": "numbers",
        "Special Characters:": "special",
    };

    const outputs = {}; // key -> <output> element

    cards.forEach((card) => {
        const labelText = ($(".label", card) || {}).textContent?.trim();
        const key = LABEL_MAP[labelText];
        const out = $(".value", card);
        const minusBtn = $(".step.minus", card);
        const plusBtn = $(".step.plus", card);

        if (key && out) outputs[key] = out;
        if (minusBtn && out) minusBtn.addEventListener("click", () => stepValue(key, -1));
        if (plusBtn && out) plusBtn.addEventListener("click", () => stepValue(key, +1));
    });

    // ---------- Value bounds ----------
    const BOUNDS = {
        length: { min: 4, max: 64 },
        upper: { min: 0, max: 64 },
        lower: { min: 0, max: 64 },
        numbers: { min: 0, max: 64 },
        special: { min: 0, max: 64 },
    };

    function getValue(key) {
        const el = outputs[key];
        return el ? parseInt(el.textContent, 10) || 0 : 0;
    }

    function setValue(key, value) {
        const el = outputs[key];
        if (!el) return;
        el.textContent = String(value);

        // Quick pulse animation for visual feedback
        el.style.transition = "transform .1s ease";
        el.style.transform = "scale(1.15)";
        requestAnimationFrame(() => {
            setTimeout(() => { el.style.transform = "scale(1)"; }, 100);
        });
    }

    // Ensure upper + lower + numbers + special <= length
    function normalizeCounts() {
        const length = getValue("length");
        let total = getValue("upper") + getValue("lower") + getValue("numbers") + getValue("special");
        if (total <= length) return;

        const order = ["special", "numbers", "lower", "upper"];
        while (total > length) {
            let changed = false;
            for (const k of order) {
                const v = getValue(k);
                if (v > BOUNDS[k].min) {
                    setValue(k, v - 1);
                    total--;
                    changed = true;
                    break;
                }
            }
            if (!changed) break;
        }
    }

    function stepValue(key, delta) {
        const current = getValue(key);
        const next = clamp(current + delta, BOUNDS[key].min, BOUNDS[key].max);
        setValue(key, next);
        normalizeCounts();
    }

    // ---------- Strength radio group ----------
    const PRESETS = {
        easy: { length: 8, upper: 1, lower: 6, numbers: 1, special: 0 },
        medium: { length: 14, upper: 2, lower: 6, numbers: 3, special: 2 },
        hard: { length: 22, upper: 4, lower: 7, numbers: 4, special: 4 },
    };

    function getStrength() {
        const selected = strengthButtons.find(
            (b) => b.getAttribute("aria-checked") === "true"
        );
        if (!selected) return "medium";
        if (selected.classList.contains("easy")) return "easy";
        if (selected.classList.contains("hard")) return "hard";
        return "medium";
    }

    function setStrength(btn) {
        strengthButtons.forEach((b) => {
            const sel = b === btn;
            b.setAttribute("aria-checked", sel ? "true" : "false");
            b.classList.toggle("is-selected", sel);
            b.tabIndex = sel ? 0 : -1;
        });
        applyPreset(getStrength());
    }

    function applyPreset(preset) {
        const d = PRESETS[preset] || PRESETS.medium;
        setValue("length", d.length);
        setValue("upper", d.upper);
        setValue("lower", d.lower);
        setValue("numbers", d.numbers);
        setValue("special", d.special);
        normalizeCounts();
    }

    // Click
    strengthButtons.forEach((btn) => {
        btn.addEventListener("click", () => setStrength(btn));
    });

    // Keyboard (arrow-key navigation)
    if (strengthGroup) {
        strengthGroup.addEventListener("keydown", (e) => {
            const idx = strengthButtons.findIndex(
                (b) => b.getAttribute("aria-checked") === "true"
            );
            if (idx === -1) return;
            let next;
            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                next = strengthButtons[(idx + 1) % strengthButtons.length];
            } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                next = strengthButtons[(idx - 1 + strengthButtons.length) % strengthButtons.length];
            } else if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                next = document.activeElement;
                if (!strengthButtons.includes(next)) return;
            }
            if (next) { next.focus(); setStrength(next); }
        });
    }

    // Init default selection
    const initBtn = strengthButtons.find((b) => b.getAttribute("aria-checked") === "true") || strengthButtons[0];
    if (initBtn) setStrength(initBtn);

    // ---------- Toast ----------
    let toastTimer;
    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("show"), 2000);
    }

    // ---------- Banner error ----------
    function showBannerError(msg) {
        if (!msg) {
            bannerError.classList.remove("visible");
            bannerError.textContent = "";
            return;
        }
        bannerError.textContent = msg;
        bannerError.classList.add("visible");
    }

    // ---------- Password display ----------
    function setPasswordDisplay(password) {
        if (!password) {
            passwordBox.innerHTML = '<span class="output-placeholder">Click "Generate Password" to begin...</span>';
            passwordBox.classList.remove("has-password");
            copyBtn.disabled = true;
            return;
        }
        passwordBox.textContent = password;
        copyBtn.disabled = false;

        // Trigger reveal animation
        passwordBox.classList.remove("has-password");
        void passwordBox.offsetWidth; // force reflow
        passwordBox.classList.add("has-password");
    }

    // ---------- Generate password (API call) ----------
    async function generatePassword() {
        showBannerError("");

        const length = getValue("length");
        const upper = getValue("upper");
        const lower = getValue("lower");
        const numbers = getValue("numbers");
        const special = getValue("special");

        if (length < 1) {
            showBannerError("Password length must be at least 1.");
            return;
        }

        if (upper + lower + numbers + special > length) {
            showBannerError("Sum of character counts exceeds the total password length.");
            return;
        }

        ctaBtn.disabled = true;
        ctaBtn.textContent = "Forging...";

        try {
            const payload = {
                strength: getStrength(),
                total_length: length,
                uppercase_count: upper,
                lowercase_count: lower,
                digit_count: numbers,
                special_count: special,
            };

            const res = await fetch("/api/generate-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                showBannerError(data.error || "Something went wrong. Please try again.");
                return;
            }

            showBannerError("");
            setPasswordDisplay(data.password);
            showToast("Password generated!");
        } catch (err) {
            showBannerError("Could not reach the server. Is Flask running?");
        } finally {
            ctaBtn.disabled = false;
            ctaBtn.textContent = "Generate Password";
        }
    }

    // ---------- Copy to clipboard ----------
    async function copyPassword() {
        const text = (passwordBox.textContent || "").trim();
        if (!text) return;

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                showToast("Copied to clipboard!");
                return;
            }
            // Fallback
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.cssText = "position:fixed;opacity:0";
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand("copy");
            document.body.removeChild(ta);
            if (ok) showToast("Copied to clipboard!");
            else showBannerError("Copy failed. Please select the password manually.");
        } catch {
            showBannerError("Copy failed. Please select the password manually.");
        }
    }

    // ---------- Wire events ----------
    if (ctaBtn) ctaBtn.addEventListener("click", generatePassword);
    if (copyBtn) copyBtn.addEventListener("click", copyPassword);

    // Init
    setPasswordDisplay("");
})();
