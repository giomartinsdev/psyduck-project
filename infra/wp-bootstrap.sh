#!/bin/bash
set -e

echo "=== Waiting for WordPress Core ==="
until [ -f /var/www/html/wp-settings.php ]; do sleep 3; done

echo "=== Waiting for MySQL ==="
until bash -c 'cat < /dev/null > /dev/tcp/mysql/3306' 2>/dev/null; do sleep 3; done
sleep 5

if [ ! -f /usr/local/bin/wp ]; then
    curl -sO https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
    chmod +x wp-cli.phar && mv wp-cli.phar /usr/local/bin/wp
fi

cd /var/www/html

if ! wp core is-installed --allow-root 2>/dev/null; then
    wp core install \
        --url="http://localhost:8080" \
        --title="TechStore" \
        --admin_user="admin" \
        --admin_password="admin_password" \
        --admin_email="admin@techstore.dev" \
        --skip-email --allow-root
fi

wp plugin install woocommerce --activate --allow-root 2>/dev/null || true
wp plugin install wp-graphql  --activate --allow-root 2>/dev/null || true
wp plugin install https://github.com/wp-graphql/wp-graphql-woocommerce/releases/latest/download/wp-graphql-woocommerce.zip \
    --activate --force --allow-root 2>/dev/null || true
wp rewrite structure '/%postname%/' --hard --allow-root 2>/dev/null || true

# ─── Helper: seed one WooCommerce product ─────────────────────────────────────
seed_product() {
    local TITLE="$1" CONTENT="$2" PRICE="$3" COMPARE="$4" STOCK="$5" SLUG="$6"
    local ID
    ID=$(wp post create \
        --post_title="$TITLE" \
        --post_content="$CONTENT" \
        --post_status="publish" \
        --post_type="product" \
        --porcelain --allow-root 2>/dev/null) || return
    [ -z "$ID" ] && return
    wp post update  "$ID" --post_name="$SLUG"  --allow-root 2>/dev/null || true
    wp post term set "$ID" product_type simple  --allow-root 2>/dev/null || true
    wp post meta update "$ID" _price         "$PRICE"   --allow-root 2>/dev/null
    wp post meta update "$ID" _regular_price "$COMPARE" --allow-root 2>/dev/null
    wp post meta update "$ID" _stock_status  instock    --allow-root 2>/dev/null
    wp post meta update "$ID" _manage_stock  yes        --allow-root 2>/dev/null
    wp post meta update "$ID" _stock         "$STOCK"   --allow-root 2>/dev/null
    echo "  + $TITLE"
}

# ─── Seed 100 products whenever count < 100 ────────────────────────────────────
PRODUCT_COUNT=$(wp post list --post_type=product --format=count --allow-root 2>/dev/null || echo "0")
if [ "$PRODUCT_COUNT" -lt "100" ]; then
    echo "=== Seeding 100 products (found $PRODUCT_COUNT) ==="
    if [ "$PRODUCT_COUNT" -gt "0" ]; then
        IDS=$(wp post list --post_type=product --format=ids --allow-root 2>/dev/null || true)
        [ -n "$IDS" ] && wp post delete $IDS --force --allow-root 2>/dev/null || true
    fi

    # FORMAT: title|description|price|compare_price|stock|slug
    seed_product "Wireless Noise-Cancelling Headphones" "Premium ANC over-ear, 30h battery, Hi-Res." "1299.90" "1799.90" "42" "wireless-nc-headphones"
    seed_product "Wired Studio Monitor Headphones" "Professional 40mm drivers, foldable, closed-back." "549.90" "699.90" "30" "wired-studio-headphones"
    seed_product "Bone Conduction Sport Headphones" "Open-ear, IP67, Bluetooth 5.3, running." "399.00" "499.00" "55" "bone-conduction-headphones"
    seed_product "True Wireless Earbuds Pro ANC" "TWS ANC earbuds, 32h total, IPX5, multipoint." "699.90" "899.90" "80" "tws-earbuds-pro-anc"
    seed_product "Gaming Headset 7.1 Surround USB" "Virtual 7.1, RGB, retractable mic, USB." "399.00" "499.00" "25" "gaming-headset-71-surround"
    seed_product "Neckband Bluetooth Earphones" "Magnetic neckband, 10h battery, premium bass." "199.90" "249.90" "120" "neckband-bluetooth-earphones"
    seed_product "Hi-Fi Open-Back Headphones 300-Ohm" "Audiophile open-back, 300 ohm, velour pads." "1899.00" "2299.00" "15" "hifi-open-back-300ohm"
    seed_product "Kids Safe Volume Wireless Headphones" "85dB limit, foldable, 20h, colourful design." "149.90" "199.90" "60" "kids-wireless-headphones"
    seed_product "Portable DAC/Amp USB-C Dongle" "32-bit/384kHz, 130mW, USB-C to 3.5mm." "299.00" "399.00" "35" "portable-dac-amp-dongle"
    seed_product "Memory Foam Replacement Earpads" "Universal protein leather memory foam earpads." "49.90" "69.90" "200" "replacement-earpads-memory-foam"
    seed_product "Mechanical Keyboard TKL RGB" "Tenkeyless, Cherry MX Red, PBT keycaps, RGB." "849.90" "999.90" "18" "mechanical-keyboard-tkl-rgb"
    seed_product "60% Compact Mechanical Keyboard" "Hot-swap, gasket mount, aluminium case." "1199.00" "1499.00" "12" "mechanical-keyboard-60pct"
    seed_product "Silent Office Mechanical Keyboard" "Silent tactile switches, foam, Mac/Win, USB-C." "699.00" "849.00" "22" "silent-office-keyboard"
    seed_product "Wireless Bluetooth Slim Keyboard" "Bluetooth 5.0, 3-device pairing, 6-month battery." "249.90" "349.90" "45" "wireless-bluetooth-keyboard"
    seed_product "Ergonomic Split Keyboard Mechanical" "Split tenting, wrist-friendly, QMK/VIA." "1599.00" "1999.00" "8" "ergonomic-split-keyboard"
    seed_product "65% Mechanical Keyboard RGB" "65% with arrows, south-facing RGB, QMK support." "649.00" "799.00" "30" "mechanical-keyboard-65pct"
    seed_product "Gaming Keyboard Wrist Rest" "Memory foam, anti-slip, fits full-size keyboards." "89.90" "119.90" "150" "keyboard-wrist-rest"
    seed_product "Wireless Numpad Standalone" "Standalone Numpad, 10h battery, universal OS." "129.00" "169.00" "70" "wireless-numpad"
    seed_product "PBT Keycap Set 104 Keys" "Double-shot PBT, Cherry profile, 104 keys, grey." "199.00" "249.00" "90" "keycap-set-pbt-104"
    seed_product "Mechanical Switch Tester 9-Key" "Test 9 switch types before buying, includes labels." "79.90" "99.90" "100" "switch-tester-9key"
    seed_product "Ergonomic Wireless Mouse" "4000 DPI, ergonomic grip, 70h battery, silent." "129.90" "179.90" "45" "ergonomic-wireless-mouse"
    seed_product "Gaming Mouse 16000 DPI RGB" "16000 DPI optical, 11 buttons, RGB, 1000Hz polling." "299.00" "399.00" "35" "gaming-mouse-16000dpi"
    seed_product "Trackball Mouse Thumb-Controlled" "Thumb trackball, Bluetooth and USB-A, adjustable DPI." "449.00" "549.00" "20" "trackball-mouse-thumb"
    seed_product "Vertical Ergonomic Mouse Wireless" "Vertical design, 6 DPI levels, side buttons, 2.4GHz." "199.00" "249.00" "40" "vertical-ergonomic-mouse"
    seed_product "Ultra-Lightweight Gaming Mouse 58g" "58g honeycomb, 25600 DPI, PTFE feet, braided cable." "449.90" "549.90" "28" "ultralight-gaming-mouse-58g"
    seed_product "Silent Click Wireless Mouse" "Whisper-quiet, Bluetooth and 2.4GHz, 18-month battery." "149.00" "199.00" "80" "silent-wireless-mouse"
    seed_product "Mouse Bungee Spring-Arm" "Spring-arm cable management, weighted base, 3 prongs." "69.90" "89.90" "120" "mouse-bungee-spring-arm"
    seed_product "XXL Gaming Mouse Pad 900x400" "900x400mm, stitched edges, water-resistant, 3mm thick." "99.00" "139.00" "150" "mousepad-xxl-900x400"
    seed_product "RGB LED Mouse Pad 350x250" "RGB illuminated, 350x250mm, anti-slip base, USB." "59.90" "79.90" "200" "mousepad-rgb-350x250"
    seed_product "Compact Travel Mouse Bluetooth" "Ultra-compact, Bluetooth, 3-month battery, click-quiet." "99.00" "139.00" "90" "travel-mouse-compact"
    seed_product "27in IPS Gaming Monitor 165Hz QHD" "2560x1440, 165Hz, 1ms, HDR400, FreeSync, USB-C." "1899.00" "2299.00" "20" "monitor-27-ips-165hz-qhd"
    seed_product "32in 4K UHD IPS Monitor USB-C" "3840x2160, 60Hz, USB-C 65W, factory calibrated." "2499.00" "3199.00" "15" "monitor-32-4k-usbc"
    seed_product "34in Ultra-Wide QHD 144Hz Curved" "3440x1440, 144Hz, curved VA, HDR400, USB-C 100W." "3499.00" "4199.00" "8" "monitor-34-ultrawide-qhd"
    seed_product "24in FHD 144Hz IPS Gaming" "1920x1080, 144Hz, IPS, FreeSync, thin bezels, VESA." "799.00" "999.00" "35" "monitor-24-fhd-144hz"
    seed_product "49in Super Ultra-Wide 240Hz" "5120x1440 DQHD, 240Hz, USB-C hub, PBP/PIP, 100W." "5999.00" "7499.00" "5" "monitor-49-superultrawide"
    seed_product "Portable 15.6in USB-C Monitor" "1920x1080, IPS, touch, 300 nits, dual USB-C, 800g." "999.00" "1299.00" "25" "monitor-portable-156-usbc"
    seed_product "27in Professional Colour Monitor 4K" "4K IPS, 99% AdobeRGB, deltaE<2, factory calibrated." "4999.00" "6499.00" "6" "monitor-27-pro-colour-4k"
    seed_product "Dual Monitor Arm Gas Spring" "Dual VESA 75/100, gas spring, full motion, cable mgmt." "399.00" "499.00" "40" "monitor-arm-dual-gas"
    seed_product "Single Monitor Arm VESA 100" "Single arm, VESA 75/100, tool-free, 10kg load." "199.00" "269.00" "60" "monitor-arm-single-vesa"
    seed_product "Privacy Filter 27in 16:9 Magnetic" "Magnetic privacy screen 16:9, blocks side view 30 deg." "149.00" "189.00" "50" "privacy-filter-27-magnetic"
    seed_product "4K Webcam with Built-in Ring Light" "4K 30fps, autofocus, ring light, dual mic, USB-C." "599.00" "749.00" "30" "webcam-4k-ring-light"
    seed_product "1080P 60fps Streaming Webcam" "1080P60, AI face tracking, noise-cancel mic, 90 FOV." "299.00" "399.00" "55" "webcam-1080p-streaming"
    seed_product "HDMI Capture Card 4K USB-C" "4K60 HDMI capture, USB 3.0, zero-lag passthrough, OBS." "499.00" "649.00" "20" "capture-card-hdmi-4k"
    seed_product "USB Condenser Microphone 192kHz" "Cardioid condenser, 192kHz/24-bit, shock mount, metal." "449.00" "599.00" "35" "usb-condenser-mic-192khz"
    seed_product "XLR Studio Condenser Microphone" "Large-diaphragm, 3 polar patterns, pop filter + stand." "1199.00" "1499.00" "12" "xlr-studio-condenser-mic"
    seed_product "Dynamic Broadcast Microphone" "Broadcast dynamic, supercardioid, internal shock mount." "899.00" "1099.00" "18" "dynamic-broadcast-mic"
    seed_product "Desk Boom Arm for Microphone" "Desk-clamp boom arm, cable mgmt, 360 rotation, 2kg." "149.00" "199.00" "80" "mic-boom-arm-desk"
    seed_product "Acoustic Foam Panels 12-Pack" "12x 30x30cm panels, NRC 0.95, self-adhesive studio foam." "199.00" "249.00" "100" "acoustic-foam-12pack"
    seed_product "USB Audio Interface 2-in 2-out" "48V phantom, MIDI I/O, ultra-low latency, software incl." "699.00" "899.00" "22" "audio-interface-2in2out"
    seed_product "15-Key Stream Deck Controller" "Programmable LCD keys, 15-key, plugin ecosystem." "999.00" "1199.00" "25" "stream-deck-15key"
    seed_product "Racing Gaming Chair 4D Armrests" "4D armrests, lumbar pillow, 150kg, metal base." "899.00" "1199.00" "15" "gaming-chair-racing-4d"
    seed_product "Ergonomic Mesh Office Chair" "Full mesh, adjustable lumbar, synchro, 5yr warranty." "1299.00" "1699.00" "10" "ergonomic-mesh-chair"
    seed_product "Ergonomic Kneeling Chair" "Active posture, knee pad adjustable, reduces back pain." "499.00" "649.00" "20" "kneeling-chair-ergonomic"
    seed_product "Electric Sit-Stand Desk 120x60" "Electric height-adjustable, memory presets, anti-collision." "2499.00" "3199.00" "8" "sit-stand-desk-electric"
    seed_product "L-Shaped Gaming Desk 160x100" "Carbon fibre surface, monitor shelf, cup holder, LED." "999.00" "1299.00" "12" "l-shaped-gaming-desk"
    seed_product "Bamboo Monitor Stand Desk Shelf" "Raises monitor 15cm, storage underneath, eco bamboo." "199.00" "269.00" "60" "monitor-stand-bamboo"
    seed_product "Cable Management Box with USB" "Hides power strips, 2 USB ports, lid, white/black." "99.00" "139.00" "100" "cable-management-box-usb"
    seed_product "Adjustable Footrest with Rocker" "Adjustable footrest, rocker, massage beads, non-slip." "149.00" "199.00" "80" "footrest-adjustable-rocker"
    seed_product "Anti-Fatigue Standing Desk Mat" "Ergonomic mat for standing desks, contoured, 90x60cm." "399.00" "499.00" "40" "anti-fatigue-standing-mat"
    seed_product "USB-C Hub 10-in-1 HDMI 4K PD100W" "HDMI 4K, 3xUSB-A 3.2, USB-C 100W, SD, Ethernet, audio." "299.00" "399.00" "70" "usbc-hub-10in1"
    seed_product "Thunderbolt 4 Dock 11 Ports 96W" "TB4 dock, 96W charging, dual 4K displays, 11 ports." "1499.00" "1899.00" "15" "thunderbolt4-dock-11port"
    seed_product "Qi2 Wireless Charging Pad 15W" "15W Qi2, MagSafe compatible, non-slip, LED indicator." "149.00" "199.00" "90" "qi2-wireless-charger-15w"
    seed_product "100W GaN Dual-Port USB-C Charger" "65W+100W GaN, compact, international voltage, fast charge." "199.00" "269.00" "100" "gan-charger-100w-dual"
    seed_product "Power Strip 6-Outlet USB Surge" "6 outlets, 4xUSB-A, 1xUSB-C, 3400J surge protection." "199.00" "249.00" "80" "power-strip-6outlet-usb"
    seed_product "Portable SSD 2TB USB 3.2 Gen2" "1050MB/s read, shock-proof, military-grade, pocket-sized." "699.00" "899.00" "30" "portable-ssd-2tb-gen2"
    seed_product "NVMe M.2 SSD 1TB PCIe Gen4" "7000MB/s read, 6500MB/s write, DRAM cache, M.2 2280." "499.00" "649.00" "45" "nvme-ssd-1tb-gen4"
    seed_product "External HDD 4TB Ultra-Slim USB3" "USB 3.0, hardware encryption, slim, 3yr warranty." "349.00" "449.00" "35" "external-hdd-4tb-slim"
    seed_product "USB Flash Drive 256GB Capless" "USB 3.2, 400MB/s read, metal, capless, key ring loop." "99.00" "129.00" "200" "usb-drive-256gb-capless"
    seed_product "MicroSD 128GB A2 U3 V30" "128GB A2 U3 V30, 160MB/s read, 4K ready, + adapter." "89.00" "119.00" "300" "microsd-128gb-a2-v30"
    seed_product "Wi-Fi 6 Router AX3000 WPA3" "AX3000 dual-band, WPA3, 4x Gb LAN, beamforming, app." "499.00" "649.00" "25" "wifi6-router-ax3000"
    seed_product "Wi-Fi 6E Mesh System 3-Pack" "Tri-band whole-home mesh, 500sqm, self-healing, app." "1999.00" "2499.00" "10" "wifi6e-mesh-3pack"
    seed_product "8-Port Gigabit Unmanaged Switch" "8x Gb, plug-and-play, metal case, silent, VLAN." "149.00" "199.00" "60" "switch-8port-gigabit"
    seed_product "Cat8 Ethernet Cable 3m Flat" "40Gbps Cat8, gold-plated RJ45, flat, 3m length." "49.00" "69.00" "300" "cat8-flat-cable-3m"
    seed_product "USB Wi-Fi Adapter AC1300 MU-MIMO" "Dual-band USB 3.0, MU-MIMO, external antennas, W/M." "89.00" "119.00" "80" "usb-wifi-ac1300"
    seed_product "Bluetooth 5.3 USB Adapter" "Plug-and-play BT 5.3, 20m range, audio and data." "49.00" "69.00" "200" "bluetooth-usb-53"
    seed_product "Aluminium Laptop Stand 6-Height" "Aluminium, 6 heights, 360 rotation, fold-flat, 10-17in." "199.00" "269.00" "80" "laptop-stand-aluminium"
    seed_product "Laptop Cooling Pad RGB 5-Fan" "5-fan cooling for 15-17in laptops, RGB, height adjust." "149.00" "199.00" "60" "cooling-pad-rgb-5fan"
    seed_product "Laptop Sleeve 15in Neoprene" "Slim neoprene sleeve, dual zip, handle, 15in MacBook." "89.00" "119.00" "150" "laptop-sleeve-15-neoprene"
    seed_product "Screen Cleaning Kit 250ml" "Microfibre cloth + 250ml alcohol-free spray, all screens." "39.00" "59.00" "300" "screen-cleaning-kit-250ml"
    seed_product "Anti-Static Wrist Strap ESD" "Adjustable ESD wrist strap, alligator clip, prevents damage." "29.00" "49.00" "200" "anti-static-wrist-strap"
    seed_product "Velcro Cable Ties 50-Pack" "50 reusable velcro cable ties, 20cm, easy management." "29.00" "49.00" "500" "velcro-cable-ties-50pack"
    seed_product "HDMI 2.1 Cable 2m Braided 48Gbps" "48Gbps, 4K@120Hz, 8K@60Hz, braided nylon, gold plated." "79.00" "99.00" "200" "hdmi-21-cable-2m"
    seed_product "DisplayPort 1.4 Cable 2m 32.4Gbps" "DP 1.4, 8K@60Hz, 4K@144Hz, CL3, braided, 2m." "79.00" "99.00" "150" "displayport-14-cable-2m"
    seed_product "USB-C to HDMI 4K@60Hz Adapter" "USB-C to HDMI 2.0, 4K@60Hz, plug-and-play, no driver." "69.00" "89.00" "200" "usbc-hdmi-4k-adapter"
    seed_product "3.5mm Headphone + Mic Splitter" "Splits 3.5mm into headphone + mic ports, aluminium." "29.00" "39.00" "300" "35mm-splitter-mic"
    seed_product "Smart Plug Wi-Fi 16A Energy Monitor" "16A, energy monitoring, voice assistant, 2.4GHz Wi-Fi." "89.00" "119.00" "100" "smart-plug-energy-16a"
    seed_product "UPS 600VA AVR Battery Backup" "600VA/360W, 6 outlets, AVR, USB comm, 10min backup." "499.00" "649.00" "20" "ups-600va-avr"
    seed_product "LED Desk Lamp with Wireless Charging" "Adjustable LED, Qi wireless base, USB-A port, timer." "299.00" "399.00" "40" "desk-lamp-wireless-charging"
    seed_product "Fingerprint USB Windows Hello" "360 biometric reader, 0.05s auth, Windows Hello USB-A." "149.00" "199.00" "50" "fingerprint-reader-usb"
    seed_product "Green Screen Collapsible 150x200cm" "Chromakey green screen, foldable frame, 150x200cm." "399.00" "499.00" "15" "green-screen-150x200"
    seed_product "18in Ring Light with Stand 3-Colour" "18in ring light, 3 colours, 10 brightness, phone mount." "299.00" "399.00" "25" "ring-light-18in-stand"
    seed_product "HDMI Capture Card 1080P60 USB-C" "1080P60 HDMI, USB-C 3.1, OBS ready, portable." "249.00" "329.00" "35" "capture-card-1080p-usbc"
    seed_product "RGB Streaming USB Microphone" "Cardioid USB mic, RGB ring, touch mute, headphone mon." "349.00" "449.00" "40" "streaming-mic-rgb-usb"
    seed_product "USB 3.2 Hub 4-Port Compact" "4x USB-A 3.2, 5Gbps, individual switches, LED." "89.00" "119.00" "150" "usb32-hub-4port"
    seed_product "USB-C SD Card Reader UHS-II" "USB-C SD + microSD, UHS-II, simultaneous read, compact." "69.00" "89.00" "200" "usbc-sdcard-reader-uhsii"
    seed_product "Active Stylus Pen 4096 Pressure" "Universal stylus, 4096 pressure, tilt, rechargeable." "199.00" "249.00" "60" "stylus-pen-4096-active"
    seed_product "Drawing Tablet A5 8192 Pressure" "A5 active area, 8192 pen pressure, battery-free, USB-C." "499.00" "649.00" "20" "drawing-tablet-a5-8192"
    seed_product "Portable Monitor Stand Foldable" "Foldable portable monitor stand, aluminium, 13-27in." "149.00" "199.00" "50" "monitor-stand-portable-foldable"
    seed_product "VESA Monitor Wall Mount Tilting" "VESA 75/100 wall mount, tilt +-15, up to 27in, 15kg." "129.00" "179.00" "60" "vesa-wall-mount-tilting"
    seed_product "Webcam Privacy Cover Magnetic" "Magnetic slide cover for built-in webcams, 3-pack." "29.00" "39.00" "500" "webcam-privacy-cover-3pack"

    echo "=== 100 products seeded into WooCommerce ==="
fi

# ─── Blog posts ─────────────────────────────────────────────────────────────────
echo "=== WordPress Bootstrap Completed ==="
