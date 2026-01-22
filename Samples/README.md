# SOAP Sample WSDL - Complex Types Example

## Purpose
This WSDL demonstrates **complex input types with nested objects and arrays** - perfect for testing sample XML generation and schema handling.

## Features

### Complex Types
- **Customer** - Top-level complex type
  - FirstName, LastName (simple strings)
  - **Address** (nested complex type)
    - Street, City, State, ZipCode
  - **PhoneNumbers** (array of PhoneNumber objects)
    - Type, Number

### Operation
**CreateCustomer** - Accepts a Customer object with nested Address and array of PhoneNumbers

### Expected Generated XML
```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://apinox.test/complextypes">
  <soapenv:Header/>
  <soapenv:Body>
    <tem:CreateCustomer>
      <tem:customer>
        <tem:FirstName>?</tem:FirstName>
        <tem:LastName>?</tem:LastName>
        <tem:Address>
          <tem:Street>?</tem:Street>
          <tem:City>?</tem:City>
          <tem:State>?</tem:State>
          <tem:ZipCode>?</tem:ZipCode>
        </tem:Address>
        <tem:PhoneNumber>
          <tem:Type>?</tem:Type>
          <tem:Number>?</tem:Number>
        </tem:PhoneNumber>
      </tem:customer>
    </tem:CreateCustomer>
  </soapenv:Body>
</soapenv:Envelope>
```

## How to Use in APInox

1. Open APInox
2. Click "Import WSDL" or "Add Interface"
3. Select "From File"
4. Navigate to: `<extension-path>/samples/complex-types-example.wsdl`
5. Select the `CreateCustomer` operation
6. See the generated request with properly nested complex types!

## Why This Matters

Most public SOAP test endpoints (like CountryInfo, ISBN, Calculator) only have **simple inputs**. Their complex types are in the **outputs** (responses), which you don't see when generating requests.

This sample WSDL has complex types in the **INPUT**, so you can see APInox correctly:
- ✅ Handle nested objects (Address inside Customer)
- ✅ Generate array elements (PhoneNumber without `[]` notation)
- ✅ Filter metadata fields (`targetNSAlias`, `targetNamespace`)
- ✅ Proper indentation and structure

## Technical Details

- **Namespace**: `http://apinox.test/complextypes`
- **Service**: CustomerService
- **Endpoint**: `http://localhost:8080/CustomerService` (mock - won't actually work)
- **SOAP Version**: 1.1 (document/literal)

## Related

This example was created to demonstrate the fix for XSD import/complex type handling in APInox. See the test suite in `webview/src/__tests__/soapUtils.test.ts` for automated validation.
