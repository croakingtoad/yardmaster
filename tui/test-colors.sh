#!/bin/bash
# Quick color test to verify terminal support

echo "Testing Railway Professional color palette:"
echo ""

# Railway Blue
echo -e "\033[38;2;91;155;213mRailway Blue (#5B9BD5) - Headers\033[0m"

# Amber Accent
echo -e "\033[38;2;244;162;97mAmber Accent (#F4A261) - Highlights\033[0m"

# Mint Green
echo -e "\033[38;2;110;231;183mMint Green (#6EE7B7) - Status\033[0m"

# Sky Blue
echo -e "\033[38;2;96;165;250mSky Blue (#60A5FA) - URLs\033[0m"

# Soft White
echo -e "\033[38;2;226;232;240mSoft White (#E2E8F0) - Content\033[0m"

echo ""
echo "If you see 5 different colored lines above, your terminal supports the new colors!"
echo ""
echo "Binary location: $(pwd)/yardmaster-tui"
echo "Binary timestamp: $(stat -c %y yardmaster-tui | cut -d'.' -f1)"
