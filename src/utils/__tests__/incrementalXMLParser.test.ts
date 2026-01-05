import { IncrementalXMLParser } from "../incrementalXMLParser";

describe("IncrementalXMLParser - Partial Nodes", () => {
	let parser: IncrementalXMLParser;

	beforeEach(() => {
		parser = new IncrementalXMLParser();
	});

	it("should detect incomplete nodes as they are being streamed", () => {
		parser.append('<node id="n1" type="concept" title="Test Node" row="0" col="1">');
		parser.append("This is some ");
		
		let incomplete = parser.detectIncompleteNodes();
		expect(incomplete.length).toBe(1);
		expect(incomplete[0].id).toBe("n1");
		expect(incomplete[0].content).toBe("This is some");

		parser.append("content that is still being streamed");
		incomplete = parser.detectIncompleteNodes();
		expect(incomplete[0].content).toBe("This is some content that is still being streamed");
	});

	it("should detect groupId for nodes inside an unclosed group", () => {
		parser.append('<group id="g1" title="Test Group" row="0" col="1">');
		parser.append('  <node id="n1" type="concept" row="0" col="0">');
		parser.append("Node inside group");
		
		let incomplete = parser.detectIncompleteNodes();
		expect(incomplete.length).toBe(1);
		expect(incomplete[0].id).toBe("n1");
		expect(incomplete[0].groupId).toBe("g1");
		expect(incomplete[0].content).toBe("Node inside group");
	});

	it("should detect incomplete groups", () => {
		parser.append('<group id="g1" title="Streaming Group" row="0" col="1">');
		parser.append('  <node id="n1"');
		
		let incompleteGroups = parser.detectIncompleteGroups();
		expect(incompleteGroups.length).toBe(1);
		expect(incompleteGroups[0].id).toBe("g1");
		expect(incompleteGroups[0].title).toBe("Streaming Group");
	});

	it("should not return incomplete nodes if they are already completed", () => {
		parser.append('<node id="n1" type="concept" row="0" col="1">Complete node</node>');
		
		// detectCompleteNodes marks it as processed
		const complete = parser.detectCompleteNodes();
		expect(complete.length).toBe(1);
		
		const incomplete = parser.detectIncompleteNodes();
		expect(incomplete.length).toBe(0);
	});
});
