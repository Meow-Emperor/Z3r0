import { Button } from "@douyinfe/semi-ui";
import { type FormEvent, type ReactNode, useId } from "react";
import { UI_TEXT } from "../lib/uiText";
import { AppModal, type AppModalSize } from "./AppModal";

type ResourceModalProps = {
  open: boolean;
  title: string;
  titleIcon: ReactNode;
  saving: boolean;
  submitLabel: string;
  submitDisabled?: boolean;
  size?: AppModalSize;
  onCancel: () => void;
  onSubmit: () => void | Promise<void>;
  children: ReactNode;
};

export function ResourceModal({
  open,
  title,
  titleIcon,
  saving,
  submitLabel,
  submitDisabled = false,
  size = "compact",
  onCancel,
  onSubmit,
  children,
}: ResourceModalProps) {
  const formId = useId();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || submitDisabled) return;
    await onSubmit();
  };

  const handleCancel = () => {
    if (!saving) onCancel();
  };

  return (
    <AppModal
      open={open}
      title={title}
      titleIcon={titleIcon}
      onCancel={handleCancel}
      footer={(
        <div className="app-modal-actions">
          <Button type="tertiary" onClick={handleCancel} disabled={saving}>{UI_TEXT.cancel}</Button>
          <Button
            form={formId}
            htmlType="submit"
            theme="solid"
            type="primary"
            loading={saving}
            disabled={submitDisabled}
          >
            {submitLabel}
          </Button>
        </div>
      )}
      size={size}
      maskClosable={!saving}
      closeOnEsc={!saving}
      closable={!saving}
      className="resource-modal"
    >
      <form id={formId} className="resource-form" onSubmit={handleSubmit}>
        {children}
      </form>
    </AppModal>
  );
}
