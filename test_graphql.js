
const axios = require('axios');
const https = require('https');
const http = require('http');

async function test() {
    const url = 'https://spacex-production.up.railway.app/';
    const query = `query GetLaunches {
  launchesPast(limit: 5) {
    mission_name
    launch_date_local
    rocket {
      rocket_name
    }
  }
}`;
    const payload = JSON.stringify({
        query: query,
        variables: {},
        operationName: undefined
    });

    // Match HttpClient logic
    const agentOptions = { keepAlive: false, rejectUnauthorized: true };
    const httpsAgent = new https.Agent(agentOptions);
    const httpAgent = new http.Agent(agentOptions);

    try {
        const res = await axios({
            method: 'post',
            url: url,
            data: payload,
            headers: {
                'Content-Type': 'application/json'
            },
            httpsAgent: httpsAgent,
            httpAgent: httpAgent,
            validateStatus: () => true
        });

        console.log("Status:", res.status);
        console.log("Body:", JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error("Error:", e.message);
        if (e.response) {
            console.error("Response:", JSON.stringify(e.response.data));
        }
    }
}

test();
