/**
 * Script to fix XSD import paths in Organisation WSDL/XSD files
 * Replaces remote URLs with relative local file paths
 */

const fs = require('fs');
const path = require('path');

const SAMPLES_DIR = path.join(__dirname, '..', 'Samples', 'Organisation');

// Mapping from namespace to local filename (from our cache logs)
const NAMESPACE_TO_FILE = {
  'http://health.gov.au/ebo/Reference': 'health.gov.au.ebo.Reference.xsd',
  'http://socialservices.gov.au/AgedCare/Organisation': 'socialservices.gov.au.AgedCare.Organisation.wsdl',
  'http://socialservices.gov.au/Common/v2': 'socialservices.gov.au.Common.v2.xsd',
  'http://socialservices.gov.au/Common': 'socialservices.gov.au.Common.xsd',
  'http://socialservices.gov.au/ebm/Attachment/v3': 'socialservices.gov.au.ebm.Attachment.v3.xsd',
  'http://socialservices.gov.au/ebm/Organisation': 'socialservices.gov.au.ebm.Organisation.xsd',
  'http://socialservices.gov.au/ebo/Address': 'socialservices.gov.au.ebo.Address.xsd',
  'http://socialservices.gov.au/ebo/Assessment': 'socialservices.gov.au.ebo.Assessment.xsd',
  'http://socialservices.gov.au/ebo/Attachment/v3': 'socialservices.gov.au.ebo.Attachment.v3.xsd',
  'http://socialservices.gov.au/ebo/Attachment': 'socialservices.gov.au.ebo.Attachment.xsd',
  'http://socialservices.gov.au/ebo/CarePlan': 'socialservices.gov.au.ebo.CarePlan.xsd',
  'http://socialservices.gov.au/ebo/Classification': 'socialservices.gov.au.ebo.Classification.xsd',
  'http://socialservices.gov.au/ebo/Contact': 'socialservices.gov.au.ebo.Contact.xsd',
  'http://socialservices.gov.au/ebo/FundingAssessment': 'socialservices.gov.au.ebo.FundingAssessment.xsd',
  'http://socialservices.gov.au/ebo/Interaction': 'socialservices.gov.au.ebo.Interaction.xsd',
  'http://socialservices.gov.au/ebo/nnc': 'socialservices.gov.au.ebo.nnc.xsd',
  'http://socialservices.gov.au/ebo/Notification/v2': 'socialservices.gov.au.ebo.Notification.v2.xsd',
  'http://socialservices.gov.au/ebo/Organisation': 'socialservices.gov.au.ebo.Organisation.xsd',
  'http://socialservices.gov.au/ebo/Person': 'socialservices.gov.au.ebo.Person.xsd',
  'http://socialservices.gov.au/ebo/Referral': 'socialservices.gov.au.ebo.Referral.xsd',
  'http://socialservices.gov.au/ebo/Service': 'socialservices.gov.au.ebo.Service.xsd',
  'http://socialservices.gov.au/ebo/SupportPlanReview': 'socialservices.gov.au.ebo.SupportPlanReview.xsd',
  'http://socialservices.gov.au/Enterprise/Common': 'socialservices.gov.au.Enterprise.Common.xsd'
};

// Files to skip (example XML files)
const SKIP_FILES = ['OrgBad.xml', 'OrgGood.xml'];

function findLocalFileForNamespace(namespace) {
  // Direct match from our mapping
  if (NAMESPACE_TO_FILE[namespace]) {
    return NAMESPACE_TO_FILE[namespace];
  }
  
  // If no direct match, return null (will be kept as-is)
  return null;
}

function fixImportsInFile(filePath) {
  const fileName = path.basename(filePath);
  
  // Skip example XML files
  if (SKIP_FILES.includes(fileName)) {
    console.log(`⏭️  Skipping: ${fileName}`);
    return;
  }
  
  // Only process .xml, .wsdl, and .xsd files
  const ext = path.extname(fileName).toLowerCase();
  if (!['.xml', '.wsdl', '.xsd'].includes(ext)) {
    return;
  }
  
  console.log(`📝 Processing: ${fileName}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  let changeCount = 0;
  
  // Pattern: <xsd:import ... schemaLocation="http://..." ... />
  // Need to capture the entire import tag to find namespace anywhere in it
  const importPattern = /<xsd:import\s+([^>]+)>/g;
  
  content = content.replace(importPattern, (match, attributes) => {
    // Check if this import has a remote schemaLocation
    const schemaLocationMatch = attributes.match(/schemaLocation="(http:\/\/[^"]+)"/);
    
    if (!schemaLocationMatch) {
      return match; // Not a remote import, keep as-is
    }
    
    const remoteUrl = schemaLocationMatch[1];
    
    // Extract namespace from anywhere in the attributes
    const namespaceMatch = attributes.match(/namespace="([^"]+)"/);
    
    if (namespaceMatch) {
      const namespace = namespaceMatch[1];
      const localFile = findLocalFileForNamespace(namespace);
      
      if (localFile) {
        modified = true;
        changeCount++;
        console.log(`  ✓ ${namespace} → ${localFile}`);
        
        // Replace the remote URL with local file path
        const newAttributes = attributes.replace(
          /schemaLocation="http:\/\/[^"]+"/,
          `schemaLocation="${localFile}"`
        );
        return `<xsd:import ${newAttributes}>`;
      }
    }
    
    // If we can't map it, keep it as-is but log it
    console.log(`  ⚠️  Cannot map import (no namespace or unknown): ${remoteUrl.substring(0, 60)}...`);
    return match;
  });
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  ✅ Saved with ${changeCount} changes\n`);
  } else {
    console.log(`  ℹ️  No remote imports found\n`);
  }
}

function main() {
  console.log('🔧 Fixing XSD Import Paths\n');
  console.log(`📂 Directory: ${SAMPLES_DIR}\n`);
  
  const files = fs.readdirSync(SAMPLES_DIR);
  let processedCount = 0;
  
  for (const file of files) {
    const filePath = path.join(SAMPLES_DIR, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isFile()) {
      fixImportsInFile(filePath);
      processedCount++;
    }
  }
  
  console.log(`\n✅ Done! Processed ${processedCount} files.`);
  console.log('📋 Next steps:');
  console.log('   1. Load Organisation.xml in APInox');
  console.log('   2. Check logs for schema loading');
  console.log('   3. Generate XML and compare to OrgGood.xml');
}

main();
