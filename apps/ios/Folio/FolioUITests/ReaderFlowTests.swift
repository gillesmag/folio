import XCTest

/// Drives the app the way a person would: tap a document, scroll it, tap a paragraph, comment.
/// Needs the local dev servers and the seeded session (see SPEC.md §14). Screenshots go to
/// the directory in the FOLIO_SHOTS environment variable, when set, so they can be inspected
/// outside the xcresult bundle.
///
/// Gestures inside the document use screen coordinates rather than accessibility queries:
/// a large page's accessibility tree is slow to walk and would time the test out.
final class ReaderFlowTests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchEnvironment["FOLIO_SERVER"] = ProcessInfo.processInfo.environment["FOLIO_SERVER"] ?? "http://localhost:5173"
        app.launchEnvironment["FOLIO_TOKEN"] = ProcessInfo.processInfo.environment["FOLIO_TOKEN"] ?? "simulator-session-token-0001"
        app.launch()
    }

    private func shot(_ name: String) {
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let dir = ProcessInfo.processInfo.environment["FOLIO_SHOTS"] {
            let url = URL(fileURLWithPath: dir).appendingPathComponent("\(name).png")
            try? screenshot.pngRepresentation.write(to: url)
        }
    }

    private func point(_ x: CGFloat, _ y: CGFloat) -> XCUICoordinate {
        app.coordinate(withNormalizedOffset: CGVector(dx: x, dy: y))
    }

    private func drag(from: CGFloat, to: CGFloat) {
        point(0.5, from).press(forDuration: 0.05, thenDragTo: point(0.5, to), withVelocity: .fast, thenHoldForDuration: 0)
    }

    /// The toolbar answering is the liveness check: a stuck main thread fails this.
    private func assertReaderAlive(_ label: String) {
        XCTAssertTrue(app.buttons["Comments"].waitForExistence(timeout: 15), "reader toolbar missing: \(label)")
    }

    func testOpenScrollAndComment() {
        let row = app.staticTexts["Deploy sequence, step by step"]
        XCTAssertTrue(row.waitForExistence(timeout: 15), "document list did not load")
        shot("u1-list")
        row.tap()
        assertReaderAlive("after tapping a row")
        sleep(3)
        shot("u2-reader-open")

        drag(from: 0.8, to: 0.3)
        sleep(1)
        shot("u3-after-scroll-down")
        drag(from: 0.3, to: 0.8)
        sleep(1)
        assertReaderAlive("after scrolling up: the bar should be back")
        shot("u4-after-scroll-up")

        // Tap a paragraph in the middle of the screen: the composer should slide in.
        point(0.5, 0.5).tap()
        let field = app.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 5), "composer did not appear after tapping a block")
        field.typeText("Looks good, but tighten this paragraph.")
        sleep(1)
        shot("u5-composer")
        app.buttons["Post"].tap()
        sleep(2)
        shot("u6-posted")

        app.buttons["Comments"].tap()
        XCTAssertTrue(app.staticTexts["Looks good, but tighten this paragraph."].waitForExistence(timeout: 10), "posted comment not listed")
        shot("u7-comments-sheet")
        app.buttons["Done"].tap()
        sleep(1)

        // Back to the list, then the largest document, to catch a hang on a second open.
        app.navigationBars.buttons.element(boundBy: 0).tap()
        let second = app.staticTexts["Torture test: every edge the renderer should survive"]
        XCTAssertTrue(second.waitForExistence(timeout: 10), "list did not come back")
        second.tap()
        assertReaderAlive("after opening the large document")
        sleep(4)
        shot("u8-large-doc")
        drag(from: 0.85, to: 0.15)
        drag(from: 0.85, to: 0.15)
        sleep(1)
        // Reading downwards hides the bar; the back button is the only chrome left to check.
        XCTAssertFalse(app.buttons["Comments"].exists, "bar should hide while scrolling down")
        shot("u9-large-doc-scrolled")
        drag(from: 0.2, to: 0.7)
        sleep(1)
        assertReaderAlive("after scrolling back up in the large document")
        shot("u10-large-doc-bar-back")
    }
}
