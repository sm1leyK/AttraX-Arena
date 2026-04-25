import re

from playwright.sync_api import sync_playwright, expect


URL = "http://127.0.0.1:5173/#/space"


def wait_for_space(page):
    page.goto(URL)
    page.wait_for_load_state("networkidle")
    page.wait_for_selector("#spaceCanvas canvas", timeout=30000)
    page.wait_for_function(
        "() => document.querySelector('#spaceStatus')?.dataset.tone === 'ready'",
        timeout=30000,
    )
    page.wait_for_timeout(700)


def canvas_stats(page):
    return page.evaluate(
        """
        () => {
          const canvas = document.querySelector("#spaceCanvas canvas");
          const rect = canvas.getBoundingClientRect();
          const sample = document.createElement("canvas");
          sample.width = 48;
          sample.height = 48;
          const context = sample.getContext("2d", { willReadFrequently: true });
          context.drawImage(canvas, 0, 0, sample.width, sample.height);
          const data = context.getImageData(0, 0, sample.width, sample.height).data;
          let painted = 0;
          let checksum = 0;
          for (let index = 0; index < data.length; index += 4) {
            const alpha = data[index + 3];
            const light = data[index] + data[index + 1] + data[index + 2];
            if (alpha > 8 && light > 24) {
              painted += 1;
            }
            checksum = (checksum + (data[index] * 3 + data[index + 1] * 5 + data[index + 2] * 7 + alpha) * ((index % 113) + 1)) % 1000000007;
          }
          return {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            painted,
            checksum,
          };
        }
        """
    )


def assert_canvas_live(page, label):
    first = canvas_stats(page)
    assert first["width"] > 300, f"{label}: canvas too narrow: {first}"
    assert first["height"] > 300, f"{label}: canvas too short: {first}"
    assert first["painted"] > 120, f"{label}: canvas looks blank: {first}"
    page.wait_for_timeout(800)
    second = canvas_stats(page)
    assert second["checksum"] != first["checksum"], f"{label}: canvas did not animate: {first} -> {second}"
    return first, second


def find_hover_hit(page):
    box = page.locator("#spaceCanvas canvas").bounding_box()
    assert box, "canvas bounding box missing"
    probes = [
        (0.50, 0.46),
        (0.50, 0.55),
        (0.42, 0.50),
        (0.58, 0.50),
        (0.36, 0.52),
        (0.64, 0.52),
        (0.30, 0.48),
        (0.70, 0.48),
        (0.24, 0.52),
        (0.76, 0.52),
    ]
    for fx, fy in probes:
        x = box["x"] + box["width"] * fx
        y = box["y"] + box["height"] * fy
        page.mouse.move(x, y)
        page.wait_for_timeout(120)
        cursor = page.eval_on_selector("#spaceCanvas canvas", "node => node.style.cursor")
        if cursor == "pointer":
            return x, y
    raise AssertionError("no interactive 3D hover target found")


def verify_desktop(page):
    page.set_viewport_size({"width": 1440, "height": 900})
    wait_for_space(page)
    assert_canvas_live(page, "desktop")
    page.screenshot(path=".playwright-mcp/space-desktop-interaction.png", full_page=True)

    x, y = find_hover_hit(page)
    page.mouse.click(x, y)
    expect(page.locator("#spaceDialog")).to_have_class(re.compile(r".*\bis-open\b.*"))
    dialog_line = page.locator("#spaceDialogLine").inner_text().strip()
    assert dialog_line and dialog_line != "--", "desktop dialog did not render character copy"

    page.locator("#spaceDialogClose").click()
    expect(page.locator("#spaceDialog")).not_to_have_class(re.compile(r".*\bis-open\b.*"))


def verify_mobile(page):
    page.set_viewport_size({"width": 390, "height": 844})
    wait_for_space(page)
    assert_canvas_live(page, "mobile")
    page.screenshot(path=".playwright-mcp/space-mobile-interaction.png", full_page=True)

    page.locator('[data-space-target="qa-sentinel"]').click()
    expect(page.locator("#spaceDialog")).to_have_class(re.compile(r".*\bis-open\b.*"))
    target = page.locator("#spaceDialog").get_attribute("data-space-target")
    assert target == "qa-sentinel", f"mobile selector opened wrong dialog: {target}"
    page.keyboard.press("Escape")
    expect(page.locator("#spaceDialog")).not_to_have_class(re.compile(r".*\bis-open\b.*"))


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    verify_desktop(page)
    verify_mobile(page)
    browser.close()

print("space interaction check passed")
