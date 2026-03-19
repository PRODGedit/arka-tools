// ==UserScript==
// @name         10speed Planner Auto Email
// @namespace    http://tampermonkey.net/
// @version      0.4
// @description  Planner Auto Email with debug logs and Outlook-ready mailto
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
// Auto Email Module with debug and Outlook-ready mailto
// -----------------------------
function AutoEmailModule() {
    return async function generateAutoEmail() {
        console.log("Button clicked: generating email...");
        try {
            const dict = await loadDictionaries();

            // ---- MOCK DATA ----
            const res = [
                {
                    driver: "John Doe",
                    driver_phone: "555-1234",
                    truck: { number: "TX123", trailer: "TR456" },
                    order_id: "11111",
                    bol: "2222",
                    broker: "TestBroker",
                    stops: [
                        { destination: { city: "Los Angeles", state: "CA" } },
                        { destination: { city: "San Francisco", state: "CA" } }
                    ]
                }
            ];
            console.log("Using mock API response:", res);

            if (!res.length) return alert("No legs found");

            const leg = res[0];
            const driverFullName = leg.driver || "Driver Unknown";
            const [firstName, lastName] = driverFullName.split(" ");
            const truckStr = typeof leg.truck === "string" ? leg.truck : leg.truck?.number || "";
            const trailerStr = typeof leg.truck?.trailer === "string" ? leg.truck.trailer : leg.truck?.trailer || "";
            const phone = leg.driver_phone || "";

            console.log("Driver info:", { driverFullName, truckStr, trailerStr, phone });

            const orderNumber = leg.order_id || "Unknown";
            const bol = leg.bol || "";
            const origin = leg.stops?.[0]?.destination?.city || "";
            const destination = leg.stops?.[leg.stops.length - 1]?.destination?.city || "";

            console.log("Order info:", { orderNumber, bol, origin, destination });

            // Lookup emails
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
${truckStr} ${trailerStr}
${firstName || ""} ${lastName || ""}
${phone || ""}
DM @${staffInfo.dmName || "DM"} for updates
`;

            console.log("Email subject:", subject);
            console.log("Email body:", body);

            // Open Outlook / default mail client
            const mailtoURL = `mailto:${toRecipients}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            console.log("Opening mailto URL:", mailtoURL);
            window.location.href = mailtoURL; // more reliable than window.open for Outlook

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
