# WCF Debugging with Dirty SOAP

This guide explains how to intercept, inspect, and modify SOAP messages in your C# WCF applications. This allows you to copy requests into Dirty SOAP for testing, and paste responses back into your application to mock scenarios.

## 1. Create the Message Inspector
The `IClientMessageInspector` allows you to hook into the `BeforeSendRequest` and `AfterReceiveReply` stages.

```csharp
using System.ServiceModel;
using System.ServiceModel.Channels;
using System.ServiceModel.Dispatcher;
using System.Xml;
using System.IO;

public class DirtySoapInspector : IClientMessageInspector
{
    // Called before the request is sent to the server.
    public object BeforeSendRequest(ref Message request, IClientChannel channel)
    {
        // ---------------------------------------------------------
        // TIP: Put a Breakpoint here!
        // ---------------------------------------------------------
        // 1. Inspect 'request.ToString()' to see the XML being sent.
        // 2. Copy this XML into Dirty SOAP to verify/debug it.
        // 3. (Advanced) You can overwrite 'request' here if you want to inject 
        //    modified XML from Dirty SOAP back into the app.
        
        return null;
    }

    // Called after the server replies, but before your app processes it.
    public void AfterReceiveReply(ref Message reply, object correlationState)
    {
        // ---------------------------------------------------------
        // SCENARIO: MOCKING A RESPONSE
        // ---------------------------------------------------------
        // If you want to force the application to receive a specific XML 
        // (e.g., a specific success/failure you crafted in Dirty SOAP):
        
        // 1. Define your custom XML (escape quotes as needed)
        string myCustomXml = @"
            <s:Envelope xmlns:s='http://schemas.xmlsoap.org/soap/envelope/'>
                <s:Body>
                    <MyResponse xmlns='http://tempuri.org/'>
                        <Result>Success (Mocked by Dirty SOAP)</Result>
                    </MyResponse>
                </s:Body>
            </s:Envelope>";

        // 2. Create the Reader
        using (var reader = XmlReader.Create(new StringReader(myCustomXml)))
        {
            // 3. Create a NEW Message object
            // vital: Reuse the Version from the original reply to avoid protocol errors
            Message originalReply = reply;
            Message newReply = Message.CreateMessage(reader, int.MaxValue, originalReply.Version);

            // 4. Copy Properties (Optional, but good practice for HTTP headers/status)
            newReply.Properties.CopyProperties(originalReply.Properties);

            // 5. Overwrite the reference
            // The application will now 'see' your custom XML instead of the network response.
            reply = newReply;
        }
        
        // WARNING: 'Message' is a forward-only stream. 
        // If you do `var log = reply.ToString()` without re-creating the message,
        // you will break the stream and the app will crash/receive nothing.
    }
}
```

## 2. Register the Behavior
You need an `IEndpointBehavior` to add your inspector to the client runtime.

```csharp
using System.ServiceModel.Description;
using System.ServiceModel.Dispatcher;
using System.ServiceModel.Channels;

public class DirtySoapBehavior : IEndpointBehavior
{
    public void AddBindingParameters(ServiceEndpoint endpoint, BindingParameterCollection bindingParameters) { }
    
    public void ApplyClientBehavior(ServiceEndpoint endpoint, ClientRuntime clientRuntime)
    {
        // Add our inspector to the collection
        clientRuntime.MessageInspectors.Add(new DirtySoapInspector());
    }

    public void ApplyDispatchBehavior(ServiceEndpoint endpoint, EndpointDispatcher endpointDispatcher) { }
    public void Validate(ServiceEndpoint endpoint) { }
}
```

## 3. Apply to your Client
Add the behavior to your WCF client instance before making calls.

```csharp
// Initialize your generated WCF Client
var client = new YourServiceClient();

// Add the behavior
client.Endpoint.EndpointBehaviors.Add(new DirtySoapBehavior());

// Usage
var result = client.SomeMethod(); // This call will now be intercepted!
```
