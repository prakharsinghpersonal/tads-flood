import { Component, type ReactNode } from 'react';

interface Props {
  onError: (message: string) => void;
  resetKey: string;
  children: ReactNode;
}

// A map failure must not take down the settlement lists, inspector or report.
export default class MapBoundary extends Component<Props, { failed: string | null; key: string }> {
  state = { failed: null as string | null, key: this.props.resetKey };

  static getDerivedStateFromError(err: Error) {
    return { failed: err.message };
  }

  static getDerivedStateFromProps(props: Props, state: { failed: string | null; key: string }) {
    return props.resetKey !== state.key ? { failed: null, key: props.resetKey } : null;
  }

  componentDidCatch(err: Error) {
    this.props.onError(`Map failed: ${err.message}. Lists, inspector and report remain available.`);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="map-placeholder" role="alert">
          <p>The map could not be drawn. Use the settlement and asset lists; evidence remains available.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
