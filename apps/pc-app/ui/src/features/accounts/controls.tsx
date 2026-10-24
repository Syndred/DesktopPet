import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import { Checkbox } from "../../components/ui/checkbox";
import { Slider } from "../../components/ui/slider";

/** Domain value adapters only. Keyboard, focus, ARIA and popups are the shared Radix components. */
export function AccountSelect({ label, value, onChange, options, disabled = false, className = "" }: {
  label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>;
  disabled?: boolean; className?: string;
}) {
  return <Select value={value} onValueChange={onChange} disabled={disabled}>
    <SelectTrigger aria-label={label} className={`ac-select-trigger ${className}`}><SelectValue /></SelectTrigger>
    <SelectContent className="accounts-menu" position="popper">{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
  </Select>;
}
export function AccountSwitch({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <Switch className="ac-radix-switch" aria-label={label} checked={checked} onCheckedChange={onChange} disabled={disabled} />;
}
export function AccountCheckbox({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <Checkbox className="ac-radix-checkbox" aria-label={label} checked={checked} onCheckedChange={value => onChange(value === true)} disabled={disabled} />;
}
export function AccountSlider({ value, onChange, disabled = false }: { value: number; onChange: (value: number) => void; disabled?: boolean }) {
  return <Slider ref={node => {
    // The registry Slider forwards attributes to Root; the accessible name belongs
    // on its Radix Thumb. Preserve the shared interaction, label its actual slider.
    node?.querySelector('[role="slider"]')?.setAttribute("aria-label", "音量");
  }} className="ac-radix-slider" min={0} max={100} step={1} value={[value]} onValueChange={values => onChange(values[0])} disabled={disabled} />;
}
