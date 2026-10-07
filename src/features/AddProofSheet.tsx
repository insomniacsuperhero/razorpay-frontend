import { useRef, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BottomSheet, BottomSheetBody, BottomSheetHeader, CameraIcon, ChevronRightIcon, FileTextIcon, ImageIcon, LockIcon, Text,
} from '@razorpay/blade/components';
import { useUploads } from '../state/uploads';
import { useWorkspace } from './workspace';

/** Screen 2 — Add proof. Three sources, multi-select, privacy line, a hint based on the dispute reason.
 *  The seller never labels a file; the app sorts files itself. */
export function AddProofSheet({ isOpen, onDismiss }: { isOpen: boolean; onDismiss: () => void }) {
  const { data, root } = useWorkspace();
  const { add } = useUploads();
  const navigate = useNavigate();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);

  function picked(e: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    if (!list.length) return;
    add(list);
    onDismiss();
    navigate(`${root}/checking`);
  }

  const options = [
    { ref: camera, icon: CameraIcon, title: 'Take a photo', sub: 'Packing, delivery or a printed receipt' },
    { ref: gallery, icon: ImageIcon, title: 'Choose from gallery', sub: 'Courier or WhatsApp screenshots' },
    { ref: files, icon: FileTextIcon, title: 'Choose a file', sub: 'Invoice or receipt as PDF or Word' },
  ];

  return (
    <>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={picked} data-testid="input-camera" />
      <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={picked} data-testid="input-gallery" />
      <input ref={files} type="file" accept=".pdf,.docx,application/pdf" multiple hidden onChange={picked} data-testid="input-file" />
      <BottomSheet isOpen={isOpen} onDismiss={onDismiss} snapPoints={[0.5, 0.85, 0.95]}>
        <BottomSheetHeader title="Add proof" subtitle="Pick one or more. We'll sort them for you." />
        <BottomSheetBody>
          <div className="hint">
            <Text size="small" color="surface.text.gray.normal">{data.requirements.hint}</Text>
          </div>
          <div className="source-list" role="list">
            {options.map(o => (
              <button key={o.title} className="source" role="listitem" onClick={() => o.ref.current?.click()}>
                <span className="source-icon"><o.icon size="large" color="surface.icon.primary.normal" /></span>
                <span className="source-text">
                  <Text weight="semibold">{o.title}</Text>
                  <Text size="small" color="surface.text.gray.muted">{o.sub}</Text>
                </span>
                <ChevronRightIcon size="medium" color="surface.icon.gray.muted" />
              </button>
            ))}
          </div>
          <div className="privacy">
            <LockIcon size="small" color="surface.icon.gray.muted" />
            <Text size="small" color="surface.text.gray.muted">Only the files you pick are read. Nothing else on your phone is accessed.</Text>
          </div>
        </BottomSheetBody>
      </BottomSheet>
    </>
  );
}
