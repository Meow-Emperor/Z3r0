import { Modal } from "@douyinfe/semi-ui";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../lib/className";

const APP_MODAL_WIDTH = {
  compact: 520,
  standard: 720,
  wide: 980,
} as const;

export type AppModalSize = keyof typeof APP_MODAL_WIDTH;

type AppModalProps = Omit<ComponentProps<typeof Modal>, "centered" | "size" | "title" | "visible" | "width"> & {
  open: boolean;
  title: string;
  titleIcon: ReactNode;
  titleDescription?: ReactNode;
  size?: AppModalSize;
  width?: number | string;
};

export function AppModal({
  open,
  title,
  titleIcon,
  titleDescription,
  size = "compact",
  width,
  className,
  footer = null,
  children,
  ...modalProps
}: AppModalProps) {
  return (
    <Modal
      {...modalProps}
      centered
      visible={open}
      title={(
        <div className="app-modal-title">
          <span className="app-modal-title-icon">{titleIcon}</span>
          <strong className="app-modal-title-heading">{title}</strong>
          {titleDescription ? (
            <span className="app-modal-title-description">{titleDescription}</span>
          ) : null}
        </div>
      )}
      width={width ?? APP_MODAL_WIDTH[size]}
      footer={footer}
      className={cx("app-modal", className)}
    >
      {children}
    </Modal>
  );
}
