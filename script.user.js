// ==UserScript==
// @name         10speed Planner Auto Email w/Clipboard
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Planner Auto Email with DM first name, copies body to clipboard, respects Outlook default font/size
// @match        https://arka.10speed.cloud/planning/dispatch*
// @match        https://arka.10speed.cloud/orders/*
// @grant        none
// ==/UserScript==

(function() {
"use strict";

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

function getAuthToken() {
    for (const key in localStorage) {
        if (key.includes("CognitoIdentityServiceProvider") && key.includes("idToken")) {
            return localStorage.getItem(key);
        }
    }
    return null;
}

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

async function fetchIdentityId(token) {
    try {
        const payload = {
            IdentityPoolId: "us-east-1:c494308a-f6e3-4d7d-a446-118f05cb242e",
            Logins: {
                "cognito-idp.us-east-1.amazonaws.com/us-east-1_cRNQDcqMI": token
            }
        };
        const res = await fetch("https://cognito-identity.us-east-1.amazonaws.com/", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-amz-json-1.1",
                "X-Amz-Target": "AWSCognitoIdentityService.GetId",
                "Accept": "*/*"
            },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`Cognito GetId HTTP ${res.status}`);
        const data = await res.json();
        return data.IdentityId || null;
    } catch (err) {
        console.error("FETCH IDENTITY_ID ERROR:", err);
        return null;
    }
}

async function fetchInitialData(token) {
    try {
        const identityId = await fetchIdentityId(token);
        if (!identityId) return null;
        const res = await fetch("https://arka.10speed.cloud/api/initial", {
            method: "PUT",
            headers: {
                "accept": "*/*",
                "content-type": "application/json; charset=UTF-8",
                "authorization": token
            },
            credentials: "include",
            body: JSON.stringify({ identity_id: identityId })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error("FETCH INITIAL DATA ERROR:", err);
        return null;
    }
}

function resolveDM(initialData, managerUsername) {
    if (!initialData) return { fullName: managerUsername, email: "" };
    const users = initialData?.users?.operations || [];
    const dm = users.find(u => u.username === managerUsername);
    if (!dm) return { fullName: managerUsername, email: "" };
    const fullName = `${dm.given_name || ""} ${dm.family_name || ""}`.trim();
    const email = dm.given_name && dm.family_name
        ? `${dm.given_name.toLowerCase()}.${dm.family_name[0].toLowerCase()}@arkaexpress.com`
        : "";
    return { fullName, email };
}

function AutoEmailModule() {
    return async function generateAutoEmail() {
        const token = getAuthToken();
        if (!token) return;

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
        if (!orderId) return;

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
            if (!Array.isArray(data) || !data.length) return;

            const leg = data[0];
            const info = extractTruckDriverInfo(leg);
            const initialData = await fetchInitialData(token);
            const dm = resolveDM(initialData, info.driverManager);

            const orderNumber = leg.order_id || "Unknown";
            const bol = leg.bol || "";
            const originCity = leg.stops?.[0]?.destination?.city || "";
            const originState = leg.stops?.[0]?.destination?.state || "";
            const destCity = leg.stops?.[leg.stops.length - 1]?.destination?.city || "";
            const destState = leg.stops?.[leg.stops.length - 1]?.destination?.state || "";

            const origin = `${originCity}, ${originState}`;
            const destination = `${destCity}, ${destState}`;

            const toRecipients = [dm.email, "test@example.com"].filter(Boolean).join(";");
            const subject = `${origin} ${destination} // Order# ${orderNumber} BOL ${bol}`;

            const body = `Hello!\n\nDriver's info:\n${info.truckNumber} ${info.trailerNumber}\n${info.driverFullName}\n${info.driverPhone}\nDM @${dm.fullName} for updates\n`;

            // Copy body to clipboard
            await navigator.clipboard.writeText(body);

            // Open mailto with subject & recipients only
            window.open(`mailto:${toRecipients}?subject=${encodeURIComponent(subject)}`, "_blank");

        } catch (err) {
            console.error("AUTO EMAIL ERROR", err);
        }
    };
}

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
