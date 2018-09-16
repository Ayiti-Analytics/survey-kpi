import React from 'react';
import autoBind from 'react-autobind';
import reactMixin from 'react-mixin';
import Reflux from 'reflux';
import bem from '../../bem';
import FormGalleryGridItem from './formGalleryGridItem';
import stores from '../../stores';
import {
  PAGE_SIZE,
  GROUPBY_OPTIONS,
  galleryActions,
  galleryStore
} from './galleryInterface';
import {
  t,
  formatTimeDate
} from '../../utils';
import {MODAL_TYPES} from '../../constants';

export default class FormGalleryGrid extends React.Component {
  constructor(props) {
    super(props);
    autoBind(this);
    this.state = {
      gallery: galleryStore.state.galleries[this.props.galleryIndex],
      isFullscreen: galleryStore.state.isFullscreen,
      filterGroupBy: galleryStore.state.filterGroupBy
    };
  }

  componentDidMount() {
    this.listenTo(galleryStore, (storeChanges) => {
      if (typeof storeChanges.galleries !== 'undefined') {
        this.setState({gallery: storeChanges.galleries[this.props.galleryIndex]});
      }
      if (typeof storeChanges.filterGroupBy !== 'undefined') {
        this.setState({filterGroupBy: storeChanges.filterGroupBy});
      }
      if (typeof storeChanges.isFullscreen !== 'undefined') {
        this.setState({isFullscreen: storeChanges.isFullscreen});
      }
    });
  }

  hasMoreAttachments() {
    return this.state.gallery.loadedMediaCount < this.state.gallery.totalMediaCount;
  }

  loadMoreMedia() {
    galleryActions.loadMoreGalleryMedias(this.state.gallery.galleryIndex);
  }

  renderLoadMoreButton() {
    if (this.state.gallery.isLoadingMedias) {
      return (
        <bem.AssetGallery__loadMore m='grid'>
          <bem.AssetGallery__loadMoreMessage>
            {t('Loading…')}
          </bem.AssetGallery__loadMoreMessage>
        </bem.AssetGallery__loadMore>
      );
    } else if (this.hasMoreAttachments()) {
      return (
        <bem.AssetGallery__loadMore m='grid'>
          <bem.AssetGallery__loadMoreButton onClick={this.loadMoreMedia.bind(this)}>
            {t('Load More')}
          </bem.AssetGallery__loadMoreButton>
        </bem.AssetGallery__loadMore>
      );
    } else {
      return null;
    }
  }

  render() {
    const gridModifier = this.state.isFullscreen ? '12-per-row' : '6-per-row';

    return (
      <React.Fragment key={this.state.gallery.galleryIndex}>
        <h2>{this.state.gallery.title}</h2>

        <bem.AssetGalleryGrid m={gridModifier}>
          {this.state.gallery.medias.map(
            (media, index) => {
              return (
                <FormGalleryGridItem
                  key={index}
                  url={media.smallImage}
                  galleryIndex={this.state.gallery.galleryIndex}
                  mediaIndex={media.mediaIndex}
                  mediaTitle={media.title}
                  date={media.date}
                />
              );
            }
          )}
        </bem.AssetGalleryGrid>

        {this.renderLoadMoreButton()}
      </React.Fragment>
    );
  }
};

reactMixin(FormGalleryGrid.prototype, Reflux.ListenerMixin);
