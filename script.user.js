// ==UserScript==
// @name         10speed Planner Auto Email
// @namespace    http://tampermonkey.net/
// @version      0.5
// @description  Planner Auto Email pulling real legs info + Outlook-ready mailto
// @match        https://arka.10speed.cloud/planning/dispatch*
// @match        https://arka.10speed.cloud/orders/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/PRODGedit/arka-tools/main/script.user.js
// @downloadURL  https://raw.githubusercontent.com/PRODGedit/arka-tools/main/script.user.js
// ==/UserScript==

(function() {
"use strict";

// -----------------------------
// Helper: add button to order header
// -----------------------------
function addButtonToHeader(header, id, text, onClick) {
    if (header.querySelector("#" + id)) return;
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.gap = "8px";

    let container = header.querySelector("#tm-button-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "tm-button-container";
        container.style.display = "flex";
        container.style.alignItems = "center";
        container.style.gap = "6px";
        header.appendChild(container);
    }

    const btn = document.createElement("button");
    btn.id = id;
    btn.innerText = text;
    btn.style.padding = "5px 10px";
    btn.style.background = "rgba(239, 239, 239, 0.3)";
    btn.style.color = "#2196f3";
    btn.style.border = "1px solid #2196f3";
    btn.style.borderRadius = "4px";
    btn.style.fontSize = "14px";
    btn.style.cursor = "pointer";
    btn.onclick = onClick;

    container.appendChild(btn);
}

// -----------------------------
// Extract truck/trailer/driver info from leg
// -----------------------------
function extractTruckDriverInfo(leg) {
    if (!leg) return {};

    const truckNumber = leg.truck?.number || "";
    const trailerNumber = leg.trailer?.[0]?.number || leg.truck?.trailer?.number || "";
    const driver = leg.driver || {};
    const driverFullName = [driver.given_name, driver.family_name].filter(Boolean).join(" ") || "";
    const driverPhone = driver.phone || "";
    const driverManager = driver.manager || "";

    return {
        truckNumber,
        trailerNumber,
        driverFullName,
        driverPhone,
        driverManager
    };
}

// -----------------------------
// Auto Email Module
// -----------------------------
function AutoEmailModule() {
    return async function generateAutoEmail() {
        console.log("Button clicked: generating email...");

        try {
            // ---- FETCH / GET LEGS DATA ----
            // For testing, you can replace this with your actual fetch from API
            const legsResponse = await fetch("/api/legs?order_id=" + window.location.pathname.split("/").pop())
                .then(res => res.json())
                .catch(() => []);

            if (!legsResponse.length) return alert("No legs found");

            const leg = legsResponse[0];
            const info = extractTruckDriverInfo(leg);

            console.log("Extracted info:", info);

            // --- Order Info ---
            const orderNumber = leg.order_id || "Unknown";
            const bol = leg.bol || "";
            const origin = leg.stops?.[0]?.destination?.city || "";
            const destination = leg.stops?.[leg.stops.length - 1]?.destination?.city || "";

            // --- Lookup emails (mock for now, you can integrate dictionaries) ---
            const toRecipients = [
                "test@example.com", // placeholder
            ].filter(Boolean).join(";");

            // --- Compose subject and body ---
            const subject = `Order# ${orderNumber} BOL ${bol} / ${origin} ${destination}`;
            const body = `Hello!

Driver's info:
${info.truckNumber} ${info.trailerNumber}
${info.driverFullName}
${info.driverPhone}
DM @${info.driverManager || "DM"} for updates
`;

            console.log("Email subject:", subject);
            console.log("Email body:", body);

            // --- Open mail client in new tab ---
            const mailtoURL = `mailto:${toRecipients}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            window.open(mailtoURL, "_blank");

        } catch (err) {
            console.error("AUTO EMAIL ERROR", err);
            alert("Error generating auto email");
        }
    };
}

// -----------------------------
// Attach button when header exists
// -----------------------------
function tryAddButton() {
    const modal = document.querySelector('[data-testid="dialog-content"]');
    const orderBox = document.querySelector('[data-testid="order-box"]');
    [modal, orderBox].forEach(el => {
        if (!el) return;
        const header = el.querySelector('[data-testid="order-number"]')?.parentElement;
        if (!header) return;
        addButtonToHeader(header, "tm-auto-email-btn", "Planner Email", AutoEmailModule());
    });
}

const observer = new MutationObserver(tryAddButton);
observer.observe(document.body, { childList: true, subtree: true });
tryAddButton();

})();
