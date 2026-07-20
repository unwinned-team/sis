import { useRef, useState } from 'react';
import { uploadImage } from '../../api/admin';
import { saveErrorMessage } from './support';
import { GHOST_BUTTON_CLASS, INPUT_CLASS, LABEL_CLASS } from './ui';

export function ImageField({
  accessToken,
  value,
  onChange,
  id,
}: {
  accessToken: string;
  value: string;
  onChange: (url: string) => void;
  id: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setIsUploading(true);
    try {
      const { url } = await uploadImage(accessToken, file);
      onChange(url);
    } catch (err) {
      setError(saveErrorMessage(err));
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        Картинка
      </label>
      <div className="flex items-start gap-3">
        {value && (
          <img
            src={value}
            alt=""
            className="h-16 w-16 shrink-0 rounded-xl border border-white/70 object-cover"
          />
        )}
        <div className="flex-1">
          <input
            id={id}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://... або /uploads/..."
            className={INPUT_CLASS}
          />
          <div className="mt-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
              className={`${GHOST_BUTTON_CLASS} !px-4 !py-1.5 !text-xs`}
            >
              {isUploading ? 'Завантаження...' : 'Завантажити файл'}
            </button>
          </div>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}
