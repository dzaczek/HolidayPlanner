from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 800})
    page.goto('http://localhost:4173/')
    page.wait_for_timeout(2000)
    page.screenshot(path='header.png', clip={"x": 0, "y": 0, "width": 1400, "height": 150})
    browser.close()
