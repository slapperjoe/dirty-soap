import { ApinoxProject } from '../../../shared/src/models';

export const SAMPLES_PROJECT: ApinoxProject = {
    id: 'samples-project-read-only',
    name: 'Samples',
    description: 'A collection of read-only sample requests (SOAP, REST, GraphQL)',
    readOnly: true,
    interfaces: [],
    folders: [
        {
            id: 'samples-folder-soap',
            name: 'SOAP',
            requests: [
                {
                    id: 'sample-soap-calc-add',
                    readOnly: true,
                    name: 'Calculator - Add',
                    endpoint: 'http://www.dneonline.com/calculator.asmx',
                    method: 'POST',
                    requestType: 'soap',
                    contentType: 'text/xml; charset=utf-8',
                    headers: {
                        'Content-Type': 'text/xml; charset=utf-8',
                        'SOAPAction': 'http://tempuri.org/Add'
                    },
                    request: `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Add xmlns="http://tempuri.org/">
      <intA>5</intA>
      <intB>7</intB>
    </Add>
  </soap:Body>
</soap:Envelope>`
                }
            ]
        },
        {
            id: 'samples-folder-rest',
            name: 'REST',
            requests: [
                {
                    id: 'sample-rest-get-users',
                    readOnly: true,
                    name: 'Get Users',
                    endpoint: 'https://jsonplaceholder.typicode.com/users',
                    method: 'GET',
                    requestType: 'rest',
                    request: '',
                    headers: {
                        'Accept': 'application/json'
                    }
                },
                {
                    id: 'sample-rest-post-posts',
                    readOnly: true,
                    name: 'Create Post',
                    endpoint: 'https://jsonplaceholder.typicode.com/posts',
                    method: 'POST',
                    requestType: 'rest',
                    bodyType: 'json',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    request: `{\n  "title": "foo",\n  "body": "bar",\n  "userId": 1\n}`
                }
            ]
        },
        {
            id: 'samples-folder-graphql',
            name: 'GraphQL',
            requests: [
                {
                    id: 'sample-graphql-spacex',
                    readOnly: true,
                    name: 'SpaceX - Get Launches',
                    endpoint: 'https://spacex-production.up.railway.app/',
                    method: 'POST',
                    requestType: 'graphql',
                    bodyType: 'graphql',
                    contentType: 'application/json',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    request: `query GetLaunches {
  launchesPast(limit: 5) {
    mission_name
    launch_date_local
    rocket {
      rocket_name
    }
  }
}`
                }
            ]
        }
    ]
};
