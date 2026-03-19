// ==UserScript==
// @name         10speed Planner Auto Email
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Planner Auto Email with debug logs
// @match        https://arka.10speed.cloud/planning/*
// @match        https://arka.10speed.cloud/orders/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/PRODGedit/arka-tools/main/script.user.js
// @downloadURL  https://raw.githubusercontent.com/PRODGedit/arka-tools/main/script.user.js
// ==/UserScript==

(function () {
"use strict";

// -----------------------------
// Helper to add buttons
// -----------------------------
function addButtonToHeader(header, id, text, onClick) {
    if (header.querySelector("#" + id)) return;

    // Make header flex row if needed
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
    btn.style.background = "rgba(239, 239, 239, 0.3)"; // secondary
    btn.style.color = "#2196f3"; // main
    btn.style.border = "1px solid #2196f3";
    btn.style.borderRadius = "4px";
    btn.style.fontSize = "14px";
    btn.style.cursor = "pointer";
    btn.style.transition = "all 0.2s";

    let copying = false;

    btn.onmouseenter = () => {
        if (!copying) btn.style.background = "rgba(33, 150, 243, 0.1)";
    };

    btn.onmouseleave = () => {
        if (!copying) btn.style.background = "rgba(239, 239, 239, 0.3)";
    };

    btn.onclick = () => {
        onClick();
        copying = true;
        // subtle copied feedback: light overlay
        btn.style.background = "rgb(33 150 243)";
        btn.style.color = "rgba(239, 239, 239, 0.8)";
        setTimeout(() => {
            btn.style.background = "rgba(239, 239, 239, 0.3)";
            btn.style.color = "#2196f3";
            copying = false;
        }, 800);
    };

    container.appendChild(btn);
}

// -----------------------------
// EMAIL CAPTION MODULE
// -----------------------------
function EmailCaptionModule() {
    function text(el) { return el ? el.innerText.trim() : ""; }
    function getLegs() {
        const legs = [];
        const legBlocks = document.querySelectorAll(".css-hxayed > .css-hkp102");

        legBlocks.forEach(block => {
            const spans = [...block.querySelectorAll("span._1tpsh6v6")]
            .map(el => el.innerText.replace(/\(Leg \d+\)/, "").trim());

            const driver = spans[0] || "";
            const truck = spans[1] || "";
            const trailers = spans.slice(2).filter(v => /^[A-Z]\d+/i.test(v));
            const trailer = trailers.length ? trailers[0] : "";

            // push even if empty
            legs.push({ driver, truck, trailer });
        });

        return legs;
    }
    function getOrder() { return text(document.querySelector('[data-testid="order-number"]')); }
    function getBOL() {
        const labels = [...document.querySelectorAll("p")];
        for (const p of labels) if (p.innerText.includes("Bill of lading")) return text(p.nextElementSibling);
        return "";
    }

    function getLocations() {
        console.log("=== getLocations DEBUG START ===");

        const labels = document.querySelectorAll(".MuiStepLabel-label");

        console.log("All stop labels found:", labels.length);

        labels.forEach((el, i) => {
            console.log(`Stop ${i}:`, el.innerText);
        });

        if (!labels.length) {
            console.log("No stops found");
            return { origin: "", destination: "" };
        }

        const origin = labels[0].innerText.trim();
        const destination = labels[labels.length - 1].innerText.trim();

        console.log("Parsed origin:", origin);
        console.log("Parsed destination:", destination);
        console.log("=== getLocations DEBUG END ===");

        return { origin, destination };
    }

    function generateCaption() {
        const legs = getLegs();
        const order = getOrder();
        const bol = getBOL();
        const { origin, destination } = getLocations();

        let captions = [];

        if (!legs.length) {
            // fallback if NO legs at all
            captions.push(`${order} BOL ${bol} // ${origin}  ${destination}`);
        } else {
            captions = legs.map(leg => {
                const parts = [];

                if (leg.driver) parts.push(leg.driver);

                const equipment = [leg.truck, leg.trailer].filter(Boolean).join(" ");
                if (equipment) parts.push(equipment);

                parts.push(`${order}  BOL ${bol}`);
                parts.push(`${origin}  ${destination}`);

                return parts.join(" // ");
            });
        }

        GM_setClipboard(captions.join("\n\n"));
    }
        return generateCaption;
}

// -----------------------------
// LOAD INFO MODULE
// -----------------------------
function LoadInfoModule() {
    function getAuthToken() {
        for (const key in localStorage) if (key.includes("CognitoIdentityServiceProvider") && key.includes("idToken")) return localStorage.getItem(key);
        return null;
    }
    const token = getAuthToken();
    if (!token) return null;

    let orderId = null;

    // Order page
    const match = window.location.pathname.match(/orders\/(\d+)/);
    if (match) {
        orderId = match[1];
    }

    // Dispatch modal
    if (!orderId) {
        const orderEl = document.querySelector('[data-testid="order-number"]');
        if (orderEl) {
            const text = orderEl.innerText || "";
            const num = text.match(/\d+/);
            if (num) orderId = num[0];
        }
    }

    if (!orderId) {
        console.warn("Order ID not found");
        return () => alert("Order ID not detected");
    }

    const onlyParam = encodeURIComponent("*,driver.*,truck.*,truck.trailer.*,stops.*,stops.destination.*,stops.trailer.*");
    const apiUrl = `https://arka.10speed.cloud/api/legs?page=0&size=100&only=${onlyParam}&order_id=${orderId}&order=sort.asc`;

    function parseISOWithTZ(isoStr){ if(!isoStr) return null; if(!isoStr.endsWith("Z")) isoStr+="Z"; return new Date(isoStr);}
    function formatSingleTime(iso,tz){ const dUTC=parseISOWithTZ(iso); const dStr=dUTC.toLocaleString("en-US",{timeZone:tz}); const dLocal=new Date(dStr); return `${dLocal.getMonth()+1}/${dLocal.getDate()} ${String(dLocal.getHours()).padStart(2,"0")}:${String(dLocal.getMinutes()).padStart(2,"0")}`;}
    function formatTimeRange(fromIso,toIso,tz){ const fromUTC=parseISOWithTZ(fromIso); const toUTC=parseISOWithTZ(toIso); const fromLocal=new Date(fromUTC.toLocaleString("en-US",{timeZone:tz})); const toLocal=new Date(toUTC.toLocaleString("en-US",{timeZone:tz})); if(toLocal<fromLocal)toLocal.setDate(toLocal.getDate()+1); return `${fromLocal.getMonth()+1}/${fromLocal.getDate()} ${String(fromLocal.getHours()).padStart(2,"0")}:${String(fromLocal.getMinutes()).padStart(2,"0")}-${String(toLocal.getHours()).padStart(2,"0")}:${String(toLocal.getMinutes()).padStart(2,"0")}`;}

    function formatLoadMessage(leg, globalPickNumbers) {
        const StopLoad={1:"Live",2:"Drop&Hook",3:"Drop",4:"Hook"};
        const bol = leg.bol || "";

        const allStops = leg.stops || [];

        let pickupStops = [];
        let deliveryStops = [];

        allStops.forEach((stop, index) => {
            if (stop.type === 1) {
                pickupStops.push(stop);
            }
            else if (stop.type === 2) {
                deliveryStops.push(stop);
            }
            else if (stop.type === 3) {
                // Additional stop — determine role by position
                if (index === 0) {
                    pickupStops.push(stop);
                } else if (index === allStops.length - 1) {
                    deliveryStops.push(stop);
                } else {
                    // middle additional stop – treat as pickup by default
                    pickupStops.push(stop);
                }
            }
        });

        function formatStops(stops){
            return stops.map((stop,idx)=>{
                const dest=stop.destination||stop||{};
                const city=dest.city||"",state=dest.state||"",name=dest.name||"",line1=dest.line1||"",zip=dest.zip||"",tz=dest.timezone||"UTC";
                const time=(function(){if(!stop.appointment_from)return""; const fromUTC=parseISOWithTZ(stop.appointment_from); const toUTC=stop.appointment_to?parseISOWithTZ(stop.appointment_to):null; if(!toUTC||fromUTC.getTime()===toUTC.getTime()) return formatSingleTime(stop.appointment_from,tz); else return formatTimeRange(stop.appointment_from,stop.appointment_to,tz);})();
                const stopType=StopLoad[stop.load]||(stop.type===1?"PRELOADED":"LIVE");
                return `Stop ${idx+1}: ${time} - ${stopType}\n\n${name}\n${line1} ${city}, ${state} ${zip}`;
            }).join("\n\n");
        }

        const pickupMessage=pickupStops.length>0?formatStops(pickupStops):"No pickup stops";
        const deliveryMessage=deliveryStops.length>0?formatStops(deliveryStops):"No delivery stops";

        let driverInstructions="";
        try{ const tempObj=pickupStops[0]?.destination?.temp?JSON.parse(pickupStops[0].destination.temp):{}; if(tempObj.instructions) driverInstructions=tempObj.instructions||"";}catch(e){}

        const allPickNumbers = globalPickNumbers;

        const originCity=pickupStops[0]?.destination?.city||pickupStops[0]?.city||"";
        const originState=pickupStops[0]?.destination?.state||pickupStops[0]?.state||"";
        const destCity=deliveryStops[deliveryStops.length-1]?.destination?.city||deliveryStops[deliveryStops.length-1]?.city||"";
        const destState=deliveryStops[deliveryStops.length-1]?.destination?.state||deliveryStops[deliveryStops.length-1]?.state||"";
        const cityLine=(originCity&&originState&&destCity&&destState)?`${originCity}, ${originState} → ${destCity}, ${destState}\n\n`:"";

        const distanceMiles=Math.round((leg.distance||0)/1609.34);
        return `${cityLine}BOL: ${bol}
${distanceMiles} miles

PICKUPS:
${pickupMessage}

DELIVERIES:
${deliveryMessage}

Instructions / pick numbers:
BOL: ${bol}
${allPickNumbers.join(" ") || ""}

${driverInstructions}`.trim();
    }

    function generateLoadInfo() {
        fetch(apiUrl,{
            method:"GET",
            credentials:"include",
            headers:{
                "authorization":token,
                "accept":"*/*"
            }
        })
            .then(res=>res.json())
            .then(data=>{
            if(!Array.isArray(data)||data.length===0){
                alert("No legs found");
                return;
            }

            console.log("=== LOAD INFO DEBUG ===");
            console.log("Leg count:", data.length);

            // Collect ALL pick numbers across ALL legs
            const globalPickNumbers = [];

            data.forEach(leg => {
                (leg.stops || []).forEach(stop => {
                    try {
                        if (stop.references) {
                            const parsed = JSON.parse(stop.references);
                            parsed.forEach(r => {
                                if (r.value) globalPickNumbers.push(r.value);
                            });
                        }
                    } catch(e) {}
                });
            });

            const messages = data.map(leg => formatLoadMessage(leg, globalPickNumbers));

            const finalMessage = messages.join("\n\n\n");

            console.log("Final message:", finalMessage);

            GM_setClipboard(finalMessage);

            const indicator=document.querySelector("#tm-load-info-btn-indicator");
            if(!indicator) return;

            indicator.style.background="#22c55e";
            indicator.style.borderColor="#16a34a";

            setTimeout(()=>{
                indicator.style.background="#ddd";
                indicator.style.borderColor="#bbb";
            },1500);
        })
            .catch(err=>console.error("LOAD FETCH ERROR",err));
    }

    return generateLoadInfo;
}

// -----------------------------
// Add both buttons on DOM mutations
// -----------------------------
function tryAddButtonsToUI() {
    const modal=document.querySelector('[data-testid="dialog-content"]');
    const orderBox=document.querySelector('[data-testid="order-box"]');
    [modal, orderBox].forEach(el=>{
        if(!el) return;
        const header=el.querySelector('[data-testid="order-number"]')?.parentElement;
        if(!header) return;
        addButtonToHeader(header, "tm-email-caption-btn", "Email", EmailCaptionModule());
        addButtonToHeader(header, "tm-load-info-btn", "Load Info", LoadInfoModule());
    });
}

const observer = new MutationObserver(tryAddButtonsToUI);
observer.observe(document.body, { childList: true, subtree: true });
tryAddButtonsToUI();

})();
