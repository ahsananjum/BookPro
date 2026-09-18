async function testForex() {
    try {
        console.log("Testing open.er-api.com...");
        const res = await fetch("https://open.er-api.com/v6/latest/USD");
        const data = await res.json();
        console.log("Base:", data.base_code);
        console.log("PKR rate (USD to PKR):", data.rates?.PKR);
        console.log("EUR rate (USD to EUR):", data.rates?.EUR);
        console.log("GBP rate (USD to GBP):", data.rates?.GBP);
        console.log("AED rate (USD to AED):", data.rates?.AED);
        console.log("SAR rate (USD to SAR):", data.rates?.SAR);
        console.log("INR rate (USD to INR):", data.rates?.INR);

        const pkrToUsd = 1 / data.rates.PKR;
        console.log("1 PKR in USD:", pkrToUsd);
        const amountPkrCents = 500000; // 5,000.00 PKR
        const amountPkr = amountPkrCents / 100;
        const amountUsdCents = Math.max(50, Math.round(amountPkr * pkrToUsd * 100));
        console.log("5,000 PKR in USD cents:", amountUsdCents, "($" + (amountUsdCents / 100).toFixed(2) + ")");
    } catch (err: any) {
        console.error("Forex error:", err.message);
    }
}
testForex();
