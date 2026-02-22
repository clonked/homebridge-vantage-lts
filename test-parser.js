/**
 * Test script: validates fast-xml-parser produces the expected JSON structure
 * for the XML formats used by the Vantage InFusion controller.
 *
 * Run: node test-parser.js
 */

var { XMLParser, XMLBuilder, XMLValidator } = require('fast-xml-parser');

var xmlParser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '',
	parseTagValue: false,
	isArray: (name) => {
		return ['Interface', 'Object'].includes(name);
	}
});
var xmlBuilder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '', suppressBooleanAttributes: false });

var passed = 0;
var failed = 0;

function assert(condition, message) {
	if (condition) {
		passed++;
		console.log("  PASS: " + message);
	} else {
		failed++;
		console.error("  FAIL: " + message);
	}
}

// --- Test 1: IConfiguration OpenFilter response ---
console.log("\nTest 1: IConfiguration.OpenFilter response");
var openFilterXml = '<IConfiguration><OpenFilter><return>12345</return></OpenFilter></IConfiguration>';
var parsed1 = xmlParser.parse(openFilterXml);
assert(parsed1.IConfiguration !== undefined, "IConfiguration exists");
assert(parsed1.IConfiguration.OpenFilter !== undefined, "OpenFilter exists");
assert(parsed1.IConfiguration.OpenFilter.return == "12345", "OpenFilter.return == '12345' (got: " + parsed1.IConfiguration.OpenFilter.return + ")");

// --- Test 2: IConfiguration GetFilterResults with Load objects ---
console.log("\nTest 2: IConfiguration.GetFilterResults with multiple objects");
var filterResultsXml = `<IConfiguration><GetFilterResults><return>
  <Object><Load><VID>100</VID><Name>Kitchen Light</Name><DName>Kitchen</DName><LoadType>LED Dim</LoadType><Area>10</Area><DeviceCategory>Lighting</DeviceCategory></Load></Object>
  <Object><Load><VID>101</VID><Name>Living Room</Name><DName></DName><LoadType>Incandescent</LoadType><Area>11</Area><DeviceCategory>Lighting</DeviceCategory></Load></Object>
</return></GetFilterResults></IConfiguration>`;
var parsed2 = xmlParser.parse(filterResultsXml);
var elements = parsed2.IConfiguration.GetFilterResults.return.Object;
assert(Array.isArray(elements), "Object is an array (isArray hint works)");
assert(elements.length === 2, "Two objects returned (got: " + elements.length + ")");
assert(elements[0].Load.VID == 100, "First load VID == 100");
assert(elements[0].Load.Name === "Kitchen Light", "First load Name == 'Kitchen Light'");
assert(elements[0].Load.LoadType === "LED Dim", "First load LoadType == 'LED Dim'");

// --- Test 3: IConfiguration GetFilterResults with Thermostat ---
console.log("\nTest 3: Thermostat object parsing");
var thermostatXml = `<IConfiguration><GetFilterResults><return>
  <Object><Thermostat><VID>200</VID><Name>Master Bedroom</Name><DName>Master HVAC</DName><DeviceCategory>HVAC</DeviceCategory></Thermostat></Object>
</return></GetFilterResults></IConfiguration>`;
var parsed3 = xmlParser.parse(thermostatXml);
var thermoElements = parsed3.IConfiguration.GetFilterResults.return.Object;
assert(Array.isArray(thermoElements), "Single Thermostat returned as array");
assert(thermoElements[0].Thermostat.VID == 200, "Thermostat VID == 200");
assert(thermoElements[0].Thermostat.DName === "Master HVAC", "Thermostat DName == 'Master HVAC'");

// --- Test 4: IConfiguration GetFilterResults with Blind objects ---
console.log("\nTest 4: Blind object parsing");
var blindXml = `<IConfiguration><GetFilterResults><return>
  <Object><Blind><VID>300</VID><Name>Patio Blind</Name><DName></DName></Blind></Object>
  <Object><RelayBlind><VID>301</VID><Name>Garage Door</Name><OpenLoad>400</OpenLoad><CloseLoad>401</CloseLoad><PowerLoad>0</PowerLoad></RelayBlind></Object>
</return></GetFilterResults></IConfiguration>`;
var parsed4 = xmlParser.parse(blindXml);
var blindElements = parsed4.IConfiguration.GetFilterResults.return.Object;
assert(blindElements.length === 2, "Two blind objects returned");
assert(blindElements[0].Blind.VID == 300, "Blind VID == 300");
assert(blindElements[1].RelayBlind.OpenLoad == 400, "RelayBlind.OpenLoad == 400");

// --- Test 5: Full Project XML (simulates cached vantage.dc file) ---
console.log("\nTest 5: Full Project XML (endDownloadConfiguration path)");
var projectXml = `<Project><Objects>
  <Object><Area><VID>10</VID><Name>Kitchen</Name></Area></Object>
  <Object><Load><VID>100</VID><Name>Ceiling Light</Name><DName>Main Light</DName><LoadType>LED Dim</LoadType><Area>10</Area><DeviceCategory>Lighting</DeviceCategory><ObjectType>Load</ObjectType></Load></Object>
  <Object><Thermostat><VID>200</VID><Name>HVAC</Name><DName>Central</DName><DeviceCategory>HVAC</DeviceCategory><ObjectType>Thermostat</ObjectType></Thermostat></Object>
</Objects></Project>`;
var parsed5 = xmlParser.parse(projectXml);
assert(parsed5.Project !== undefined, "Project root exists");
assert(parsed5.Project.Objects !== undefined, "Objects exists");
var objects = parsed5.Project.Objects.Object;
assert(Array.isArray(objects), "Object is array");
assert(objects.length === 3, "Three objects (got: " + objects.length + ")");

// Test the filter logic used in VantagePlatform
var Areas = objects.filter(function (el) {
	var key = Object.keys(el)[0];
	return key == "Area";
});
assert(Areas.length === 1, "One Area found");
assert(Areas[0].Area.VID == 10, "Area VID == 10");

// --- Test 6: XMLBuilder round-trip (JSON→XML→JSON) ---
console.log("\nTest 6: XMLBuilder round-trip");
var readObjects = [
	{ Load: { VID: 100, Name: "Test Light", ObjectType: "Load" } },
	{ Thermostat: { VID: 200, Name: "Test HVAC", ObjectType: "Thermostat" } }
];
var result = {};
result["Project"] = {};
result["Project"]["Objects"] = {};
result["Project"]["Objects"]["Object"] = readObjects;
var xmlOut = xmlBuilder.build(result);
var reparsed = xmlParser.parse(xmlOut);
assert(reparsed.Project.Objects.Object.length === 2, "Round-trip preserves 2 objects");
assert(reparsed.Project.Objects.Object[0].Load.VID == 100, "Round-trip preserves VID");

// --- Test 7: ILogin response ---
console.log("\nTest 7: ILogin response");
var loginXml = '<ILogin><Login><return>true</return></Login></ILogin>';
var parsed7 = xmlParser.parse(loginXml);
assert(parsed7.ILogin !== undefined, "ILogin exists");
assert(parsed7.ILogin.Login.return == "true", "Login.return == 'true' (got: " + parsed7.ILogin.Login.return + ")");

// --- Test 8: XMLValidator rejects incomplete XML (chunked TCP simulation) ---
console.log("\nTest 8: XMLValidator rejects incomplete XML chunks");
assert(XMLValidator.validate('<IConfiguration><OpenFilter><re') !== true, "Partial tag rejected");
assert(XMLValidator.validate('<IConfiguration><GetFilterResults><return><Object><Load><VID>100</VID>') !== true, "Unclosed tags rejected");
assert(XMLValidator.validate('<IConfiguration><OpenFilter><return>12345</return></OpenFilter></IConfiguration>') === true, "Complete XML accepted");
assert(XMLValidator.validate('') !== true, "Empty string rejected");
assert(XMLValidator.validate('<IConfiguration>') !== true, "Single open tag rejected");

// --- Summary ---
console.log("\n" + "=".repeat(40));
console.log("Results: " + passed + " passed, " + failed + " failed");
if (failed > 0) {
	process.exit(1);
} else {
	console.log("All tests passed!");
}
