import type { CropId } from "../../../../../../packages/shared-types/src/features/garden";

// Original vector artwork. No farming-game sample assets are used.
export function CropArt({ crop, growing = false, className = "" }: { crop: CropId | "cooked_rice"; growing?: boolean; className?: string }) {
  return <svg className={`garden-crop-art ${className}`} viewBox="0 0 160 125" aria-hidden="true">
    <ellipse cx="80" cy="110" rx="53" ry="8" fill="#dce5d7" opacity=".6" />
    {growing ? <g><path d="M80 108V66" stroke="#508c56" strokeWidth="6" strokeLinecap="round" /><path d="M80 85C40 84 39 49 47 52C70 51 83 68 80 85Z" fill="#8dbd72" /><path d="M81 78C118 77 119 44 112 47C92 47 79 62 81 78Z" fill="#629c60" /><ellipse cx="80" cy="108" rx="34" ry="7" fill="#9f8366" /></g>
      : crop === "carrot" ? <g transform="rotate(18 80 65)"><path d="M64 44C37 58 62 102 79 115C83 88 109 49 87 43Z" fill="#f0a052" /><path d="M75 47C63 60 67 86 79 108" fill="none" stroke="#e6873a" strokeWidth="5" /><path d="M76 44C48 26 55 9 62 18L77 35C72 7 85 8 86 19L85 38C99 13 114 22 100 34L85 48Z" fill="#6d9a58" /><path d="M58 60L69 64M63 77L72 80M85 62L93 65" stroke="#d87b36" strokeWidth="3" strokeLinecap="round" /></g>
      : crop === "tomato" ? <g><circle cx="80" cy="74" r="37" fill="#ed8272" /><path d="M69 41C39 44 35 86 57 102" stroke="#f7a99a" fill="none" strokeWidth="8" strokeLinecap="round" /><path d="M80 41L64 31L66 47L46 50L67 56L80 47L94 57L109 49L90 45L94 30Z" fill="#6c9860" /><path d="M80 43L85 25" stroke="#588551" strokeWidth="5" strokeLinecap="round" /></g>
      : crop === "berry" ? <g><path d="M76 48C69 21 91 16 92 26L83 51C95 30 116 34 111 43L85 57Z" fill="#81a76d" /><circle cx="61" cy="67" r="23" fill="#ac9bc7" /><circle cx="94" cy="65" r="24" fill="#8792bf" /><circle cx="80" cy="92" r="26" fill="#9b84b9" /><circle cx="53" cy="59" r="5" fill="#d9c9e6" /><circle cx="88" cy="56" r="6" fill="#c9cfe4" /><circle cx="71" cy="82" r="6" fill="#cdb8dc" /><path d="M78 91L82 85L87 90L84 96Z" fill="#796b9d" /></g>
      : crop === "rice" ? <g stroke="#a99650" strokeWidth="3" strokeLinecap="round"><path d="M73 111L89 21M88 109L115 43M60 106L50 42" fill="none" />{[0, 1, 2, 3, 4].map(i => <g key={i}><ellipse cx={80 + i * 2} cy={34 + i * 12} rx="6" ry="10" transform={`rotate(-40 ${80 + i * 2} ${34 + i * 12})`} fill="#e2c57c" stroke="none" /><ellipse cx={96 - i} cy={38 + i * 12} rx="6" ry="10" transform={`rotate(40 ${96 - i} ${38 + i * 12})`} fill="#edd798" stroke="none" /></g>)}<path d="M73 99C39 95 44 78 47 78L73 96M84 101C111 99 126 81 123 80L84 98" fill="#9fa977" stroke="none" /></g>
      : <g><path d="M31 67C36 118 124 120 130 67Z" fill="#d6e5f6" /><ellipse cx="80" cy="66" rx="50" ry="19" fill="#f7f7ee" stroke="#a3b9dc" strokeWidth="3" /><path d="M38 61C40 48 56 49 58 42C62 32 79 35 84 41C101 26 120 44 123 60" fill="#fffdf2" />{[50, 63, 76, 89, 101, 113].map((x, i) => <path key={x} d={`M${x} ${56 + i % 2 * 5}l5 -3`} stroke="#e9e4cc" strokeWidth="4" strokeLinecap="round" />)}<path d="M58 90L65 84L72 90L65 96Z" fill="#698ac1" /><path d="M80 95Q94 106 108 91" stroke="#8ca6cd" strokeWidth="3" fill="none" /></g>}
  </svg>;
}

export function GardenScenery() {
  return <svg className="garden-scenery" viewBox="0 0 1000 270" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="garden-sky" x2="0" y2="1"><stop stopColor="#d7e8f1" /><stop offset="1" stopColor="#f4f5e9" /></linearGradient></defs>
    <path fill="url(#garden-sky)" d="M0 0h1000v270H0z" /><path d="M0 165L90 99L163 150L253 48L330 131L425 81L570 175L680 100L782 164L900 75L1000 140V270H0Z" fill="#b5cdd7" /><path d="M0 188L165 141L252 185L430 127L603 195L792 146L1000 189V270H0Z" fill="#ceddd6" />
    <path d="M0 204Q230 187 500 216T1000 196V270H0Z" fill="#dce6d8" /><path d="M380 220Q535 200 716 220T1000 219V254H375Z" fill="#bed9e6" />
    <g fill="#f8fbfa" opacity=".7"><ellipse cx="181" cy="43" rx="79" ry="13" /><ellipse cx="701" cy="53" rx="91" ry="12" /></g>
    <g stroke="#b2b49b" strokeWidth="8" fill="#f1eddb"><path d="M49 181V63M153 181V55M40 72H166M54 143H150" /><path d="M27 75Q93 35 172 71" fill="none" /></g>
    <g fill="#8aa780"><circle cx="33" cy="81" r="27" /><circle cx="58" cy="56" r="23" /><circle cx="96" cy="49" r="24" /><circle cx="147" cy="57" r="25" /><circle cx="166" cy="90" r="19" /></g>
    <g fill="#e9db9e"><circle cx="54" cy="62" r="6" /><circle cx="112" cy="43" r="6" /><circle cx="153" cy="66" r="6" /><circle cx="35" cy="90" r="5" /></g>
    <path d="M0 254Q221 231 405 258T1000 252V270H0Z" fill="#bfcdaa" />
    <g fill="#9ca485"><path d="M835 248V192L845 177L855 192V248ZM885 248V184L895 170L905 184V248ZM935 248V190L945 175L955 190V248Z" /><path d="M823 206H970V215H823ZM823 233H970V241H823Z" /></g>
    <g fill="#faf3db"><circle cx="790" cy="243" r="6" /><circle cx="814" cy="250" r="5" /><circle cx="763" cy="249" r="5" /></g>
  </svg>;
}
