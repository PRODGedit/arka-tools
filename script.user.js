// ==UserScript==
// @name         10speed Planner Auto Email w/DM Link
// @namespace    http://tampermonkey.net/
// @version      0.7
// @description  Planner Auto Email with DM full name + email link
// @match        https://arka.10speed.cloud/planning/dispatch*
// @match        https://arka.10speed.cloud/orders/*
// @grant        none
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
// Cognito Auth Token
// -----------------------------
function getAuthToken() {
    for (const key in localStorage) {
        if (key.includes("CognitoIdentityServiceProvider") && key.includes("idToken")) {
            return localStorage.getItem(key);
        }
    }
    return null;
}

// -----------------------------
// Extract truck/trailer/driver info
// -----------------------------
function extractTruckDriverInfo(leg) {
    if (!leg) return {};
    const truckNumber = leg.truck?.number || "";
    const trailerNumber = leg.trailer?.[0]?.number || leg.truck?.trailer?.number || "";
    const driver = leg.driver || {};
    const driverFullName = [driver.given_name, driver.family_name].filter(Boolean).join(" ") || "";
    const driverPhone = driver.phone || "";
    const driverManager = driver.manager || "";
    return { truckNumber, trailerNumber, driverFullName, driverPhone, driverManager };
}

// -----------------------------
// Fetch initial data
// -----------------------------
async function fetchInitialData(token) {
    try {
        const res = await fetch("https://arka.10speed.cloud/api/initial", {
            method: "PUT",
            credentials: "include",
            headers: {
                "authorization": token,
                "accept": "*/*",
                "content-type": "application/json"
            },
            body: JSON.stringify({ identity_id: "us-east-1:dummy" })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (e) {
        console.error("Failed to fetch initial data", e);
        return null;
    }
}

// -----------------------------
// Resolve DM full name and email
// -----------------------------
function resolveDM(initialData, managerUsername) {
    const users = initialData?.users?.operations || [];
    const dm = users.find(u => u.username === managerUsername);
    if (!dm) return { fullName: managerUsername, email: "" };
    const fullName = `${dm.given_name || ""} ${dm.family_name || ""}`.trim();
    const email = dm.given_name && dm.family_name
        ? `${dm.given_name.toLowerCase()}.${dm.family_name[0].toLowerCase()}@arkaexpress.com`
        : "";
    return { fullName, email };
}

// -----------------------------
// Auto Email Module
// -----------------------------
function AutoEmailModule() {
    return async function generateAutoEmail() {
        const token = getAuthToken();
        if (!token) return alert("Auth token not found");

        let orderId = null;
        const match = window.location.pathname.match(/orders\/(\d+)/);
        if (match) orderId = match[1];
        else {
            const orderEl = document.querySelector('[data-testid="order-number"]');
            if (orderEl) {
                const num = orderEl.innerText.match(/\d+/);
                if (num) orderId = num[0];
            }
        }
        if (!orderId) return alert("Order ID not detected");

        const onlyParam = encodeURIComponent("*,driver.*,truck.*,truck.trailer.*,stops.*,stops.destination.*,stops.trailer.*");
        const apiUrl = `https://arka.10speed.cloud/api/legs?page=0&size=100&only=${onlyParam}&order_id=${orderId}&order=sort.asc`;

        try {
            const res = await fetch(apiUrl, {
                method: "GET",
                credentials: "include",
                headers: { "authorization": token, "accept": "*/*" }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!Array.isArray(data) || !data.length) return alert("No legs found");

            const leg = data[0]; // first leg
            const info = extractTruckDriverInfo(leg);

            // fetch initial data once
            const initialData = await fetchInitialData(token);
            const dm = resolveDM(initialData, info.driverManager);

            const orderNumber = leg.order_id || "Unknown";
            const bol = leg.bol || "";
            const origin = leg.stops?.[0]?.destination?.city || "";
            const destination = leg.stops?.[leg.stops.length - 1]?.destination?.city || "";

            // recipients: add DM email automatically
            const toRecipients = [dm.email, "test@example.com"].filter(Boolean).join(";");

            const subject = `Order# ${orderNumber} BOL ${bol} / ${origin} ${destination}`;

            // linkify @DM in body
            const dmLink = dm.email ? `<a href="mailto:${dm.email}">${dm.fullName}</a>` : dm.fullName;
            const body = `Hello!\n\nDriver's info:\n${info.truckNumber} ${info.trailerNumber}\n${info.driverFullName}\n${info.driverPhone}\nDM ${dmLink} for updates\n`;

            const mailtoURL = `mailto:${toRecipients}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            window.open(mailtoURL, "_blank");

        } catch (err) {
            console.error("AUTO EMAIL ERROR", err);
            alert("Error generating auto email: " + err.message);
        }
    };
}

// -----------------------------
// Attach button
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
