async function testServers() {
    try {
        const webRes = await fetch("http://localhost:3000/login");
        console.log("Web server /login status:", webRes.status);
    } catch (e: any) {
        console.log("Web server error:", e.message);
    }

    try {
        const apiRes = await fetch("http://localhost:4000/api/v1/auth/me");
        console.log("API server /api/v1/auth/me status:", apiRes.status);
    } catch (e: any) {
        console.log("API server error:", e.message);
    }
}

testServers();
