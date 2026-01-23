export const generateCode = (request: any, language: 'curl' | 'node' | 'python' | 'csharp', environment?: any): string => {
    // const method = 'POST'; // SOAP is almost always POST
    const url = request.endpoint || 'http://localhost';
    const headers = {
        'Content-Type': request.soapVersion === '1.2' ? 'application/soap+xml; charset=utf-8' : 'text/xml; charset=utf-8',
        'SOAPAction': request.soapAction || ''
    };

    // Simple variable substitution
    let body = request.request || '';
    if (environment) {
        Object.keys(environment).forEach(key => {
            const val = environment[key];
            body = body.replace(new RegExp(`{{${key}}}`, 'g'), val);
        });
    }

    switch (language) {
        case 'curl':
            return `curl --location '${url}' \\
--header 'Content-Type: ${headers['Content-Type']}' \\
--header 'SOAPAction: ${headers['SOAPAction']}' \\
--data '${body.replace(/'/g, "'\\''")}'`;

        case 'node':
            return `const myHeaders = new Headers();
myHeaders.append("Content-Type", "${headers['Content-Type']}");
myHeaders.append("SOAPAction", "${headers['SOAPAction']}");

const raw = \`${body.replace(/`/g, '\\`')}\`;

const requestOptions = {
  method: "POST",
  headers: myHeaders,
  body: raw,
  redirect: "follow"
};

fetch("${url}", requestOptions)
  .then((response) => response.text())
  .then((result) => console.log(result))
  .catch((error) => console.error(error));`;

        case 'python':
            return `import requests

url = "${url}"

payload = """${body}"""
headers = {
  'Content-Type': '${headers['Content-Type']}',
  'SOAPAction': '${headers['SOAPAction']}'
}

response = requests.request("POST", url, headers=headers, data=payload)

print(response.text)`;

        case 'csharp':
            return `var client = new HttpClient();
var request = new HttpRequestMessage(HttpMethod.Post, "${url}");
request.Headers.Add("SOAPAction", "${headers['SOAPAction']}");
var content = new StringContent(@"${body.replace(/"/g, '""')}", null, "${headers['Content-Type'].split(';')[0]}");
request.Content = content;
var response = await client.SendAsync(request);
response.EnsureSuccessStatusCode();
Console.WriteLine(await response.Content.ReadAsStringAsync());`;

        default:
            return 'Unsupported language';
    }
};
