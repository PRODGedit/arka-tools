// ==UserScript==
// @name         10speed Planner Auto Email
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Planner Auto Email with debug logs
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
    console.log("Adding button:", text);

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
        console.log("Created button container");
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
    console.log("Button added:", text);
}

// -----------------------------
// Helper: fetch JSON from GitHub (returns empty object on fail)
// -----------------------------
async function fetchJSON(url) {
    try {
        const res = await fetch(url);
        return await res.json();
    } catch (e) {
        console.warn("Failed to fetch", url, e);
        return {};
    }
}

async function loadDictionaries() {
    console.log("Loading dictionaries...");
    const base = "https://raw.githubusercontent.com/PRODGedit/arka-tools/main/";
    const [brokers, staff, planners, csr, config] = await Promise.all([
        fetchJSON(base + "brokers.json"),
        fetchJSON(base + "staff.json"),
        fetchJSON(base + "planners.json"),
        fetchJSON(base + "csr.json"),
        fetchJSON(base + "config.json"),
    ]);
    console.log("Dictionaries loaded:", { brokers, staff, planners, csr, config });
    return { brokers, staff, planners, csr, config };
}

// -----------------------------
// Auto Email Module with debug
// -----------------------------
function AutoEmailModule() {
    function getAuthToken() {
        for (const key in localStorage)
            if (key.includes("CognitoIdentityServiceProvider") && key.includes("idToken"))
                return localStorage.getItem(key);
        return null;
    }

    const token = getAuthToken();
    if (!token) {
        console.warn("No auth token found");
        return () => alert("Not authenticated");
    }
    console.log("Auth token found");

    let orderId = null;
    const match = window.location.pathname.match(/orders\/(\d+)/);
    if (match) orderId = match[1];

    if (!orderId) {
        const orderEl = document.querySelector('[data-testid="order-number"]');
        if (orderEl) {
            const num = (orderEl.innerText.match(/\d+/) || [])[0];
            if (num) orderId = num;
        }
    }

    if (!orderId) {
        console.warn("Order ID not detected");
        return () => alert("Order ID not detected");
    }
    console.log("Order ID:", orderId);

    const onlyParam = encodeURIComponent("*,driver.*,truck.*,truck.trailer.*,stops.*,stops.destination.*,broker.*");
    const apiUrl = `https://arka.10speed.cloud/api/legs?page=0&size=100&only=${onlyParam}&order_id=${orderId}&order=sort.asc`;
    console.log("API URL:", apiUrl);

    return async function generateAutoEmail() {
        console.log("Button clicked: generating email...");
        try {
            const [dict, res] = await Promise.all([
                loadDictionaries(),
                fetch(apiUrl, {
                    method: "GET",
                    credentials: "include",
                    headers: { "authorization": token, "accept": "*/*" }
                }).then(r => r.json())
            ]);

            console.log("API response:", res);

            if (!Array.isArray(res) || !res.length) return alert("No legs found");

            const leg = res[0];
            console.log("Using leg:", leg);

            // Driver info
            const driverFullName = leg.driver || "Driver Unknown";
            const [firstName, lastName] = driverFullName.split(" ");
            const truck = leg.truck || "";
            const trailer = leg.truck?.trailer || "";
            const phone = leg.driver_phone || "";
            console.log("Driver info:", { driverFullName, truck, trailer, phone });

            // Order info
            const orderNumber = leg.order_id || orderId;
            const bol = leg.bol || "";
            const origin = leg.stops?.[0]?.destination?.city || "";
            const destination = leg.stops?.[leg.stops.length - 1]?.destination?.city || "";
            console.log("Order info:", { orderNumber, bol, origin, destination });

            // Lookup emails (may be empty)
            const brokerEmails = dict.brokers?.[leg.broker] || [];
            const csrEmail = dict.csr?.[leg.broker] || "";
            const originState = leg.stops?.[0]?.destination?.state || "";
            const plannerEmail = dict.planners?.[originState] || "";
            const staffInfo = dict.staff?.[driverFullName] || {};
            const dmEmail = staffInfo.dm || "";
            const coverageEmail = staffInfo.coverage || "";
            const teamLeadEmail = staffInfo.teamlead || "";
            const afterhours = dict.config?.afterhours || "";

            console.log("Emails:", {
                brokerEmails, csrEmail, plannerEmail, dmEmail, coverageEmail, teamLeadEmail, afterhours
            });

            const toRecipients = [
                ...brokerEmails,
                dmEmail,
                coverageEmail,
                teamLeadEmail,
                plannerEmail,
                csrEmail,
                afterhours
            ].filter(Boolean).join(";");

            console.log("Final TO list:", toRecipients);

            const subject = `Order# ${orderNumber} BOL ${bol} / ${origin} ${destination}`;
            const body = `Hello!

Driver's info:
${truck} ${trailer}
${firstName || ""} ${lastName || ""}
${phone || ""}
DM @${staffInfo.dmName || "DM"} for updates
`;
            console.log("Email subject:", subject);
            console.log("Email body:", body);

            window.open(`mailto:${toRecipients}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);

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
