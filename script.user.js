// ==UserScript==
// @name         ARKA Planner Email Tool
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Planner email generator
// @match        https://arka.10speed.cloud/planning/dispatch*
// @match        https://arka.10speed.cloud/orders/*
// @grant        GM_setClipboard
// @updateURL    https://raw.githubusercontent.com/YOURNAME/arka-tools/main/script.user.js
// @downloadURL  https://raw.githubusercontent.com/YOURNAME/arka-tools/main/script.user.js
// ==/UserScript==

(function () {
"use strict";

// -----------------------------
// CONFIG LOADER (CACHED)
// -----------------------------
let CONFIG = {};

async function loadJSON(url) {
    const res = await fetch(url);
    return await res.json();
}

async function loadConfig() {
    if (CONFIG.loaded) return CONFIG;

    const base = "https://raw.githubusercontent.com/YOURNAME/arka-tools/main/";

    const [brokers, staff, planners, csr] = await Promise.all([
        loadJSON(base + "brokers.json"),
        loadJSON(base + "staff.json"),
        loadJSON(base + "planners.json"),
        loadJSON(base + "csr.json")
    ]);

    CONFIG = {
        brokers,
        staff,
        planners,
        csr,
        ALWAYS: ["afterhours@company.com"],
        loaded: true
    };

    console.log("CONFIG LOADED:", CONFIG);
    return CONFIG;
}

// -----------------------------
// REUSED HELPERS
// -----------------------------
function text(el) { return el ? el.innerText.trim() : ""; }

function getOrder() {
    return text(document.querySelector('[data-testid="order-number"]'));
}

function getBOL() {
    const labels = [...document.querySelectorAll("p")];
    for (const p of labels) {
        if (p.innerText.includes("Bill of lading")) {
            return text(p.nextElementSibling);
        }
    }
    return "";
}

function getLocations() {
    const labels = document.querySelectorAll(".MuiStepLabel-label");
    if (!labels.length) return { origin: "", destination: "" };

    return {
        origin: labels[0].innerText.trim(),
        destination: labels[labels.length - 1].innerText.trim()
    };
}

function getLegs() {
    const legs = [];
    const blocks = document.querySelectorAll(".css-hxayed > .css-hkp102");

    blocks.forEach(block => {
        const spans = [...block.querySelectorAll("span._1tpsh6v6")]
            .map(el => el.innerText.replace(/\(Leg \d+\)/, "").trim());

        legs.push({
            driver: spans[0] || "",
            truck: spans[1] || "",
            trailer: spans[2] || ""
        });
    });

    return legs;
}

// -----------------------------
// OUTLOOK
// -----------------------------
function openOutlookDraft({ to, subject, body }) {
    const url = `https://outlook.office.com/mail/deeplink/compose?` +
        `to=${encodeURIComponent(to.join(";"))}` +
        `&subject=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(body)}`;

    window.open(url, "_blank");
}

// -----------------------------
// BROKER DETECTION (MVP)
// -----------------------------
function detectBroker() {
    const text = document.body.innerText.toUpperCase();

    if (text.includes("MOLO")) return "MOLO";
    if (text.includes("TQL")) return "TQL";

    return null;
}

// -----------------------------
// MAIN GENERATOR
// -----------------------------
async function generatePlannerEmail() {
    const config = await loadConfig();

    const order = getOrder();
    const bol = getBOL();
    const { origin, destination } = getLocations();
    const legs = getLegs();
    const first = legs[0] || {};

    const broker = detectBroker();
    const state = origin.split(",")[1]?.trim();

    let recipients = [];

    // Broker emails
    if (broker && config.brokers[broker]) {
        recipients.push(...config.brokers[broker]);
    }

    // Planner
    if (state && config.planners[state]) {
        recipients.push(config.planners[state]);
    }

    // CSR
    if (broker && config.csr[broker]) {
        recipients.push(config.csr[broker]);
    }

    // Always
    recipients.push(...config.ALWAYS);

    recipients = [...new Set(recipients)];

    const subject = `${order} BOL ${bol} / ${origin}, ${destination}`;

    const body = `Hello!

Driver's info:
${first.truck} ${first.trailer}
${first.driver}

`;

    openOutlookDraft({ to: recipients, subject, body });
}

// -----------------------------
// BUTTON
// -----------------------------
function addButton() {
    const header = document.querySelector('[data-testid="order-number"]')?.parentElement;
    if (!header || header.querySelector("#planner-email-btn")) return;

    const btn = document.createElement("button");
    btn.id = "planner-email-btn";
    btn.innerText = "Planner Email";

    btn.style.marginLeft = "10px";
    btn.style.padding = "5px 10px";
    btn.style.border = "1px solid #2196f3";
    btn.style.background = "rgba(239,239,239,0.3)";
    btn.style.color = "#2196f3";
    btn.style.cursor = "pointer";

    btn.onclick = generatePlannerEmail;

    header.appendChild(btn);
}

const observer = new MutationObserver(addButton);
observer.observe(document.body, { childList: true, subtree: true });

addButton();

})();
