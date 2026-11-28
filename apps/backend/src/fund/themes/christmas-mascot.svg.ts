// ==========================================
// 🎄 ORIGINAL CHIBI CHRISTMAS ELF MASCOT
// ตัวละคร Chibi เอลฟ์ฤดูหนาวต้นฉบับสำหรับธีม Christmas Wonderland
// รองรับ 4 อารมณ์และท่าทางตามความคืบหน้า: 0-30%, 31-60%, 61-99%, 100%
// หมายเหตุ: ห้ามใส่แท็ก <text> หรือ <filter> ใน SVG เพื่อความเข้ากันได้ 100% กับ @napi-rs/canvas
// ==========================================

export type ChristmasMascotStage = 'encouraging' | 'cheerful' | 'excited' | 'celebration';

export function resolveChristmasMascotStage(progressPct: number, isCompleted: boolean): ChristmasMascotStage {
    if (isCompleted || progressPct >= 100) return 'celebration';
    if (progressPct >= 61) return 'excited';
    if (progressPct >= 31) return 'cheerful';
    return 'encouraging';
}

export function getChristmasElfMascotSvg(stage: ChristmasMascotStage): string {
    const eyesAndMouth =
        stage === 'celebration'
            ? `
            <!-- Joyful celebration curved eyes -->
            <path d="M97 110 Q107 98 117 110" fill="none" stroke="#3B241A" stroke-width="4.2" stroke-linecap="round"/>
            <path d="M143 110 Q153 98 163 110" fill="none" stroke="#3B241A" stroke-width="4.2" stroke-linecap="round"/>
            <path d="M121 124 Q130 137 139 124 Z" fill="#C94145" stroke="#3B241A" stroke-width="2" stroke-linejoin="round"/>`
            : stage === 'excited'
              ? `
            <!-- Sparkly excited eyes -->
            <circle cx="107" cy="109" r="9.5" fill="#2A1D17"/>
            <circle cx="153" cy="109" r="9.5" fill="#2A1D17"/>
            <circle cx="107" cy="111" r="6" fill="#123C32"/>
            <circle cx="153" cy="111" r="6" fill="#123C32"/>
            <circle cx="110" cy="105" r="3.6" fill="#FFFDF7"/>
            <circle cx="156" cy="105" r="3.6" fill="#FFFDF7"/>
            <circle cx="103" cy="114" r="1.8" fill="#E7C779"/>
            <circle cx="149" cy="114" r="1.8" fill="#E7C779"/>
            <path d="M97 95 Q107 89 117 95" fill="none" stroke="#5A3324" stroke-width="2.3" stroke-linecap="round"/>
            <path d="M143 95 Q153 89 163 95" fill="none" stroke="#5A3324" stroke-width="2.3" stroke-linecap="round"/>
            <path d="M123 125 Q130 135 137 125 Z" fill="#E06D70" stroke="#3B241A" stroke-width="2" stroke-linejoin="round"/>`
              : stage === 'cheerful'
                ? `
            <!-- Cheerful festive eyes -->
            <circle cx="107" cy="110" r="8.8" fill="#2A1D17"/>
            <circle cx="153" cy="110" r="8.8" fill="#2A1D17"/>
            <circle cx="110" cy="106" r="3.2" fill="#FFFDF7"/>
            <circle cx="156" cy="106" r="3.2" fill="#FFFDF7"/>
            <circle cx="104" cy="113" r="1.7" fill="#FFFDF7" opacity="0.85"/>
            <circle cx="150" cy="113" r="1.7" fill="#FFFDF7" opacity="0.85"/>
            <path d="M98 96 Q107 92 116 96" fill="none" stroke="#5A3324" stroke-width="2.2" stroke-linecap="round"/>
            <path d="M144 96 Q153 92 162 96" fill="none" stroke="#5A3324" stroke-width="2.2" stroke-linecap="round"/>
            <path d="M123 125 Q130 131 137 125" fill="none" stroke="#3B241A" stroke-width="2.4" stroke-linecap="round"/>`
                : `
            <!-- Encouraging gentle eyes -->
            <circle cx="107" cy="110" r="8.5" fill="#2A1D17"/>
            <circle cx="153" cy="110" r="8.5" fill="#2A1D17"/>
            <circle cx="110" cy="106" r="3" fill="#FFFDF7"/>
            <circle cx="156" cy="106" r="3" fill="#FFFDF7"/>
            <path d="M98 95 L116 98" fill="none" stroke="#5A3324" stroke-width="2.2" stroke-linecap="round"/>
            <path d="M162 95 L144 98" fill="none" stroke="#5A3324" stroke-width="2.2" stroke-linecap="round"/>
            <path d="M125 125 Q130 129 135 125" fill="none" stroke="#3B241A" stroke-width="2.3" stroke-linecap="round"/>`;

    const armsAndProps =
        stage === 'celebration'
            ? `
            <!-- Both arms raised in celebration -->
            <path d="M96 154 Q74 134 72 114" fill="none" stroke="#185143" stroke-width="13" stroke-linecap="round"/>
            <circle cx="71" cy="111" r="6.5" fill="#FFE6D8" stroke="#3B241A" stroke-width="1.8"/>
            <path d="M164 154 Q186 134 188 114" fill="none" stroke="#185143" stroke-width="13" stroke-linecap="round"/>
            <circle cx="189" cy="111" r="6.5" fill="#FFE6D8" stroke="#3B241A" stroke-width="1.8"/>

            <!-- Wrapped Christmas gifts at feet -->
            <rect x="34" y="190" width="34" height="28" rx="5" fill="#C94145" stroke="#3B241A" stroke-width="2"/>
            <rect x="48" y="190" width="6" height="28" fill="#E7C779"/>
            <rect x="34" y="201" width="34" height="6" fill="#E7C779"/>
            <circle cx="47" cy="187" r="4" fill="#E7C779"/>
            <circle cx="55" cy="187" r="4" fill="#E7C779"/>

            <rect x="192" y="194" width="30" height="24" rx="5" fill="#185143" stroke="#3B241A" stroke-width="2"/>
            <rect x="204" y="194" width="6" height="24" fill="#C94145"/>
            <rect x="192" y="203" width="30" height="5" fill="#C94145"/>
            <circle cx="204" cy="191" r="3.5" fill="#C94145"/>
            <circle cx="210" cy="191" r="3.5" fill="#C94145"/>

            <!-- Festive confetti & golden stars -->
            <path d="M46 70 L50 80 L60 84 L50 88 L46 98 L42 88 L32 84 L42 80 Z" fill="#E7C779"/>
            <path d="M214 66 L218 76 L228 80 L218 84 L214 94 L210 84 L200 80 L210 76 Z" fill="#E7C779"/>
            <circle cx="58" cy="134" r="4" fill="#C94145"/>
            <circle cx="204" cy="136" r="4" fill="#C8E6F0"/>
            <rect x="74" y="54" width="7" height="4" rx="2" transform="rotate(28 74 54)" fill="#C94145"/>
            <rect x="184" y="50" width="7" height="4" rx="2" transform="rotate(-24 184 50)" fill="#C8E6F0"/>`
            : stage === 'excited'
              ? `
            <!-- Left cheerful wave, right holding glowing golden star -->
            <path d="M96 156 Q78 144 76 128" fill="none" stroke="#185143" stroke-width="13" stroke-linecap="round"/>
            <circle cx="75" cy="125" r="6.5" fill="#FFE6D8" stroke="#3B241A" stroke-width="1.8"/>
            <path d="M164 156 Q182 146 190 130" fill="none" stroke="#185143" stroke-width="13" stroke-linecap="round"/>
            <circle cx="192" cy="127" r="6.5" fill="#FFE6D8" stroke="#3B241A" stroke-width="1.8"/>
            <!-- Golden Christmas Star ornament -->
            <circle cx="202" cy="108" r="24" fill="#E7C779" opacity="0.22"/>
            <polygon points="202,86 208,100 223,101 211,111 215,126 202,117 189,126 193,111 181,101 196,100" fill="url(#goldElf)" stroke="#8A641E" stroke-width="2" stroke-linejoin="round"/>
            <circle cx="54" cy="96" r="3.5" fill="#E7C779"/>`
              : stage === 'cheerful'
                ? `
            <!-- Left friendly wave, right holding festive red bauble -->
            <path d="M96 156 Q78 148 76 134" fill="none" stroke="#185143" stroke-width="13" stroke-linecap="round"/>
            <circle cx="75" cy="131" r="6.5" fill="#FFE6D8" stroke="#3B241A" stroke-width="1.8"/>
            <path d="M164 156 Q182 152 190 142" fill="none" stroke="#185143" stroke-width="13" stroke-linecap="round"/>
            <circle cx="192" cy="140" r="6.5" fill="#FFE6D8" stroke="#3B241A" stroke-width="1.8"/>
            <!-- Hanging red & gold Christmas ornament -->
            <line x1="198" y1="142" x2="198" y2="156" stroke="#E7C779" stroke-width="2.5"/>
            <rect x="193" y="154" width="10" height="5" rx="1.5" fill="#E7C779"/>
            <circle cx="198" cy="173" r="15" fill="url(#redElf)" stroke="#3B241A" stroke-width="2"/>
            <path d="M185 170 Q198 178 211 170" fill="none" stroke="#E7C779" stroke-width="2.5"/>
            <circle cx="192" cy="166" r="3" fill="#FFFDF7" opacity="0.7"/>`
                : `
            <!-- Encouraging cheering pose holding small gift box -->
            <path d="M96 156 Q78 142 78 124" fill="none" stroke="#185143" stroke-width="13" stroke-linecap="round"/>
            <circle cx="78" cy="121" r="6.5" fill="#FFE6D8" stroke="#3B241A" stroke-width="1.8"/>
            <path d="M164 156 Q180 164 188 156" fill="none" stroke="#185143" stroke-width="13" stroke-linecap="round"/>
            <!-- Small festive gift held cleanly on right -->
            <rect x="180" y="144" width="32" height="28" rx="5" fill="#C94145" stroke="#3B241A" stroke-width="2"/>
            <rect x="193" y="144" width="6" height="28" fill="#E7C779"/>
            <rect x="180" y="155" width="32" height="5" fill="#E7C779"/>
            <circle cx="192" cy="141" r="3.5" fill="#E7C779"/>
            <circle cx="200" cy="141" r="3.5" fill="#E7C779"/>
            <circle cx="186" cy="156" r="5.5" fill="#FFE6D8" stroke="#3B241A" stroke-width="1.6"/>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="260" viewBox="0 0 260 260">
  <defs>
    <radialGradient id="winterGlow" cx="50%" cy="48%" r="50%">
      <stop offset="0%" stop-color="#C8E6F0" stop-opacity="0.32"/>
      <stop offset="60%" stop-color="#E7C779" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#0B2925" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="redElf" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#DF5B5F"/>
      <stop offset="100%" stop-color="#A82C30"/>
    </linearGradient>
    <linearGradient id="greenElf" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1E6352"/>
      <stop offset="100%" stop-color="#123C32"/>
    </linearGradient>
    <linearGradient id="goldElf" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FAF0CA"/>
      <stop offset="55%" stop-color="#E7C779"/>
      <stop offset="100%" stop-color="#C59B3E"/>
    </linearGradient>
  </defs>

  <!-- Winter halo behind mascot -->
  <circle cx="130" cy="130" r="115" fill="url(#winterGlow)"/>

  <!-- Soft snow drift base -->
  <ellipse cx="130" cy="222" rx="84" ry="16" fill="#F5EBD8"/>
  <ellipse cx="130" cy="219" rx="74" ry="12" fill="#FFFDF7"/>

  <!-- Back chestnut hair -->
  <circle cx="130" cy="104" r="46" fill="#7D4C36" stroke="#3B241A" stroke-width="2.2"/>

  <!-- Cute winter boots & legs -->
  <rect x="110" y="192" width="12" height="19" rx="5" fill="#FFE6D8"/>
  <rect x="138" y="192" width="12" height="19" rx="5" fill="#FFE6D8"/>
  <rect x="106" y="205" width="20" height="15" rx="6" fill="#C94145" stroke="#3B241A" stroke-width="2"/>
  <rect x="134" y="205" width="20" height="15" rx="6" fill="#C94145" stroke="#3B241A" stroke-width="2"/>
  <rect x="106" y="204" width="20" height="5" rx="2" fill="#F5EBD8"/>
  <rect x="134" y="204" width="20" height="5" rx="2" fill="#F5EBD8"/>

  <!-- Forest-green scalloped elf tunic with gold buttons -->
  <path d="M98 148 L162 148 L172 196 Q156 202 144 195 Q130 203 116 195 Q104 202 88 196 Z" fill="url(#greenElf)" stroke="#3B241A" stroke-width="2.2" stroke-linejoin="round"/>
  <circle cx="130" cy="166" r="3" fill="#E7C779"/>
  <circle cx="130" cy="179" r="3" fill="#E7C779"/>

  <!-- Festive red & cream scarf + collar -->
  <path d="M100 143 Q130 158 160 143 L154 156 Q130 166 106 156 Z" fill="#C94145" stroke="#3B241A" stroke-width="2" stroke-linejoin="round"/>
  <rect x="114" y="150" width="11" height="20" rx="4" fill="#C94145" stroke="#3B241A" stroke-width="1.8"/>
  <line x1="115" y1="160" x2="124" y2="160" stroke="#F5EBD8" stroke-width="2.5"/>

  ${armsAndProps}

  <!-- Pointed Chibi Elf Ears -->
  <path d="M89 102 Q72 98 76 112 Q82 117 91 114 Z" fill="#FFE6D8" stroke="#3B241A" stroke-width="2" stroke-linejoin="round"/>
  <path d="M171 102 Q188 98 184 112 Q178 117 169 114 Z" fill="#FFE6D8" stroke="#3B241A" stroke-width="2" stroke-linejoin="round"/>

  <!-- Face -->
  <ellipse cx="130" cy="107" rx="41" ry="37" fill="#FFE8DC" stroke="#3B241A" stroke-width="2.2"/>
  <ellipse cx="99" cy="118" rx="7" ry="4" fill="#F29C9F" opacity="0.7"/>
  <ellipse cx="161" cy="118" rx="7" ry="4" fill="#F29C9F" opacity="0.7"/>

  ${eyesAndMouth}

  <!-- Chestnut bangs -->
  <path d="M88 94 Q97 66 130 65 Q163 66 172 94 Q158 80 146 90 Q130 77 114 90 Q102 80 88 94 Z" fill="#7D4C36" stroke="#3B241A" stroke-width="2" stroke-linejoin="round"/>

  <!-- Drooping Red & Gold Christmas Elf Hat with Cream Cuff & Holly Pin -->
  <path d="M92 70 Q106 24 148 24 Q174 26 184 52 Q170 46 162 66 Z" fill="url(#redElf)" stroke="#3B241A" stroke-width="2.2" stroke-linejoin="round"/>
  <circle cx="184" cy="54" r="9" fill="#FFFDF7" stroke="#3B241A" stroke-width="2"/>
  <rect x="86" y="61" width="88" height="15" rx="7.5" fill="#F5EBD8" stroke="#3B241A" stroke-width="2.2"/>
  <!-- Holly accent on hat cuff -->
  <ellipse cx="104" cy="64" rx="7" ry="4" transform="rotate(-22 104 64)" fill="#1D634F" stroke="#3B241A" stroke-width="1.4"/>
  <ellipse cx="114" cy="65" rx="7" ry="4" transform="rotate(20 114 65)" fill="#1D634F" stroke="#3B241A" stroke-width="1.4"/>
  <circle cx="109" cy="67" r="3.5" fill="#C94145" stroke="#3B241A" stroke-width="1.2"/>
</svg>`;
}
