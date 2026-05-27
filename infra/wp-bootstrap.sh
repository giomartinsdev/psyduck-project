#!/bin/bash
set -e

echo "=== Waiting for WordPress Core Extraction ==="
until [ -f /var/www/html/wp-settings.php ]; do
    echo "WordPress files not extracted yet, sleeping 3s..."
    sleep 3
done
echo "=== WordPress Core Extracted ==="

echo "=== Waiting for Database Connection ==="
until bash -c 'cat < /dev/null > /dev/tcp/db/3306' 2>/dev/null; do
    echo "Database port 3306 not open yet, sleeping 3s..."
    sleep 3
done
echo "Database port is open! Waiting 5 more seconds for MySQL initialization..."
sleep 5


if [ ! -f /usr/local/bin/wp ]; then
    echo "=== Installing WP-CLI ==="
    curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
    chmod +x wp-cli.phar
    mv wp-cli.phar /usr/local/bin/wp
fi

cd /var/www/html

if ! wp core is-installed --allow-root; then
    echo "=== Installing WordPress Core ==="
    wp core install \
        --url="http://localhost:8080" \
        --title="Psyduck Project E-commerce" \
        --admin_user="admin" \
        --admin_password="admin_password" \
        --admin_email="admin@example.com" \
        --skip-email \
        --allow-root
fi

echo "=== Installing & Activating WooCommerce ==="
wp plugin install woocommerce --activate --allow-root

echo "=== Installing & Activating WPGraphQL ==="
wp plugin install wp-graphql --activate --allow-root

echo "=== Installing & Activating WooGraphQL ==="
wp plugin install https://github.com/wp-graphql/wp-graphql-woocommerce/releases/latest/download/wp-graphql-woocommerce.zip --activate --force --allow-root

echo "=== Configuring Permalinks ==="
wp rewrite structure '/%postname%/' --hard --allow-root

# Seed initial catalog items if WooCommerce is empty
PRODUCT_COUNT=$(wp post list --post_type=product --format=count --allow-root || echo "0")
if [ "$PRODUCT_COUNT" -eq "0" ]; then
    echo "=== Seeding WooCommerce Products ==="
    
    # 1. Ergonomic Wireless Mouse
    M1=$(wp post create --post_title="Ergonomic Wireless Mouse" --post_content="High precision ergonomic wireless mouse." --post_status="publish" --post_type="product" --porcelain --allow-root)
    wp post update "$M1" --post_name="ergonomic-wireless-mouse" --allow-root
    wp post term set "$M1" product_type simple --allow-root
    wp post meta update "$M1" _price 129.90 --allow-root
    wp post meta update "$M1" _regular_price 129.90 --allow-root
    wp post meta update "$M1" _stock_status instock --allow-root
    wp post meta update "$M1" _manage_stock yes --allow-root
    wp post meta update "$M1" _stock 45 --allow-root
    
    # 2. Mechanical Gaming Keyboard
    M2=$(wp post create --post_title="Mechanical Gaming Keyboard" --post_content="RGB mechanical keyboard with red switches." --post_status="publish" --post_type="product" --porcelain --allow-root)
    wp post update "$M2" --post_name="mechanical-gaming-keyboard" --allow-root
    wp post term set "$M2" product_type simple --allow-root
    wp post meta update "$M2" _price 349.00 --allow-root
    wp post meta update "$M2" _regular_price 349.00 --allow-root
    wp post meta update "$M2" _stock_status instock --allow-root
    wp post meta update "$M2" _manage_stock yes --allow-root
    wp post meta update "$M2" _stock 12 --allow-root

    # 3. UltraWide 4K Monitor
    M3=$(wp post create --post_title="UltraWide 4K Monitor" --post_content="34-inch curved ultra-wide IPS gaming monitor." --post_status="publish" --post_type="product" --porcelain --allow-root)
    wp post update "$M3" --post_name="ultrawide-4k-monitor" --allow-root
    wp post term set "$M3" product_type simple --allow-root
    wp post meta update "$M3" _price 1899.00 --allow-root
    wp post meta update "$M3" _regular_price 1899.00 --allow-root
    wp post meta update "$M3" _stock_status instock --allow-root
    wp post meta update "$M3" _manage_stock yes --allow-root
    wp post meta update "$M3" _stock 8 --allow-root
    
    echo "Products seeded successfully."
fi

# Seed initial blog posts
POST_COUNT=$(wp post list --post_type=post --format=count --allow-root || echo "0")
if [ "$POST_COUNT" -le "1" ]; then
    echo "=== Seeding WordPress Posts ==="
    wp post create --post_title="The Future of Headless E-commerce" --post_content="Headless architecture decouples the frontend presentation layer from the backend commerce engine, offering unmatched speed and flexibility." --post_status="publish" --post_name="future-of-headless-ecommerce" --allow-root
    wp post create --post_title="Why GraphQL is Perfect for Storefronts" --post_content="GraphQL allows frontends to request exactly the data they need, reducing bundle sizes, network calls, and page load times." --post_status="publish" --post_name="why-graphql-is-perfect-for-storefronts" --allow-root
    echo "Posts seeded successfully."
fi

echo "=== WordPress Bootstrapping Completed ==="
